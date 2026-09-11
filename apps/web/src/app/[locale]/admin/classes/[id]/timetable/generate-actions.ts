'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import {
  callSolver,
  type DayKey,
  type SolverAssignment,
  type SolverBusySlot,
  type SolverRequest,
  type SolverSlot,
  type SolverTeacher,
} from '@/lib/solver-client';
import { buildLoadReport, explainEmptyLoad, type HoursBySubject } from '@/lib/timetable-load';
import { parseSplitId, splitAssignment } from '@/lib/timetable-split-load';

type Result =
  | {
      ok: true;
      data: {
        status: string;
        message: string;
        placed: number;
        unplaced: Array<{
          subject: string;
          requestedHours: number;
          placedHours: number;
          reason: string;
        }>;
        solverTimeMs: number;
      };
    }
  | { ok: false; error: string };

const DAYS: DayKey[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/**
 * Génère l'EDT d'une classe en appelant le service solver Python.
 *
 * 1) Collecte slots + assignments (teacher × subject × class) + dispos profs
 * 2) Récupère les (teacher, day, slot) déjà occupés dans d'autres classes
 *    pour la même année → contraintes dures du solver
 * 3) Appelle POST /solve sur le service Python
 * 4) Wipe les TimetableEntry existantes pour cette classe (rempl. complet)
 * 5) Crée les nouvelles entries depuis la solution
 *
 * En cas d'échec partiel : on persiste quand même la solution partielle
 * (mode PARTIAL) et on remonte le rapport des cours non placés.
 */
export async function generateTimetableAction(
  classId: string,
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const tenantId = session.user.tenantId;

  // 1. Collecte
  let payload: SolverRequest;
  try {
    payload = await withTenant(tenantId, async (tx) => {
      const cls = await tx.class.findUnique({
        where: { id: classId },
        select: {
          id: true,
          name: true,
          nameAr: true,
          academicYearId: true,
          levelId: true,
          // La filière commande le programme au lycée : deux classes du même
          // niveau (TC Sciences, TC Lettres) n'ont ni les mêmes matières ni les
          // mêmes volumes.
          trackId: true,
          level: { select: { cycle: { select: { label: true } } } },
        },
      });
      if (!cls) throw new Error('Classe introuvable.');

      const slots = await tx.timetableSlot.findMany({
        orderBy: [{ order: 'asc' }, { startTime: 'asc' }],
      });
      if (slots.length === 0) {
        throw new Error(
          'Aucun créneau horaire défini — créez d\'abord la grille dans Paramètres.',
        );
      }

      const assignments = await tx.teacherAssignment.findMany({
        where: { classId, academicYearId: cls.academicYearId },
        include: {
          subject: { select: { id: true, label: true, labelAr: true } },
          teacher: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              availability: true,
            },
          },
        },
      });

      if (assignments.length === 0) {
        throw new Error(
          'Aucune affectation pédagogique pour cette classe — créez d\'abord les TeacherAssignment.',
        );
      }

      // Volume horaire cible, par cascade : affectation → filière → niveau.
      // Cf. lib/timetable-load pour l'ordre et sa raison.
      const [curriculum, trackRows] = await Promise.all([
        tx.curriculumSubject.findMany({ where: { levelId: cls.levelId } }),
        cls.trackId
          ? tx.trackSubjectCoefficient.findMany({
              where: { trackId: cls.trackId },
              select: { subjectId: true, weeklyHours: true },
            })
          : Promise.resolve([]),
      ]);
      const curriculumHours: HoursBySubject = new Map(
        curriculum.map((c) => [c.subjectId, c.weeklyHours]),
      );
      const trackHours: HoursBySubject | null = cls.trackId
        ? new Map(trackRows.map((r) => [r.subjectId, r.weeklyHours]))
        : null;

      const load = buildLoadReport(
        assignments.map((a) => ({
          id: a.id,
          teacherId: a.teacherId,
          subjectId: a.subjectId,
          subjectLabel: a.subject.label,
          hoursPerWeek: a.hoursPerWeek,
        })),
        trackHours,
        curriculumHours,
      );

      // Rien à placer : le solveur rendrait une grille vide et l'agent
      // conclurait à un échec du moteur. On nomme la cause à la place.
      if (load.totalHours === 0) {
        throw new Error(
          explainEmptyLoad({
            hasTrack: Boolean(cls.trackId),
            isLycee: /lyc/i.test(cls.level.cycle.label),
            missingCount: load.missing.length,
          }),
        );
      }

      const hoursByAssignment = new Map(load.rows.map((r, i) => [assignments[i]!.id, r.hours]));

      // Groupes de la classe : une matière dédoublée devient plusieurs lignes,
      // synchronisées entre elles. Sans ça le solveur ne produisait que des
      // séances en classe entière.
      const groupRows = await tx.classGroup.findMany({
        where: { classId },
        select: { id: true, subjectId: true, splitHours: true, teacherId: true },
        orderBy: [{ order: 'asc' }, { name: 'asc' }],
      });
      const groupsBySubject = new Map<string, typeof groupRows>();
      for (const g of groupRows) {
        if (!g.subjectId) continue;
        const arr = groupsBySubject.get(g.subjectId) ?? [];
        arr.push(g);
        groupsBySubject.set(g.subjectId, arr);
      }

      const solverAssignments: SolverAssignment[] = assignments.flatMap((a) => {
        const groups = groupsBySubject.get(a.subjectId) ?? [];
        return splitAssignment({
          assignmentId: a.id,
          teacherId: a.teacherId,
          subjectId: a.subjectId,
          subjectLabel: a.subject.label,
          classId: cls.id,
          className: cls.name,
          weeklyHours: hoursByAssignment.get(a.id) ?? 0,
          groups: groups.map((g) => ({ id: g.id, teacherId: g.teacherId })),
          splitHours: groups[0]?.splitHours ?? null,
        });
      });

      // Profs uniques avec dispo.
      //
      // On part des lignes envoyées au solveur, pas des affectations : un
      // groupe peut avoir son propre enseignant, qui n'est pas forcément
      // affecté à la classe. L'oublier faisait répondre au solveur « prof
      // introuvable » et le dédoublement n'était jamais placé.
      const teacherMap = new Map<string, SolverTeacher>();
      for (const a of assignments) {
        if (teacherMap.has(a.teacherId)) continue;
        teacherMap.set(a.teacherId, {
          id: a.teacherId,
          name: `${a.teacher.lastName} ${a.teacher.firstName}`,
          availability:
            (a.teacher.availability as SolverTeacher['availability']) ?? {},
        });
      }

      const extraTeacherIds = [
        ...new Set(solverAssignments.map((sa) => sa.teacher_id)),
      ].filter((id) => !teacherMap.has(id));
      if (extraTeacherIds.length > 0) {
        const extras = await tx.person.findMany({
          where: { id: { in: extraTeacherIds } },
          select: { id: true, firstName: true, lastName: true, availability: true },
        });
        for (const t of extras) {
          teacherMap.set(t.id, {
            id: t.id,
            name: `${t.lastName} ${t.firstName}`,
            availability: (t.availability as SolverTeacher['availability']) ?? {},
          });
        }
      }

      // Busy slots : autres classes de l'année, même prof
      const teacherIds = [...teacherMap.keys()];
      const busyEntries = await tx.timetableEntry.findMany({
        where: {
          academicYearId: cls.academicYearId,
          NOT: { classId },
          teacherId: { in: teacherIds },
        },
        select: { teacherId: true, dayOfWeek: true, slotId: true },
      });
      const busy: SolverBusySlot[] = busyEntries
        .filter((b) => b.teacherId !== null)
        .map((b) => ({
          teacher_id: b.teacherId!,
          day: b.dayOfWeek as DayKey,
          slot_id: b.slotId,
        }));

      const solverSlots: SolverSlot[] = slots.map((s) => ({
        id: s.id,
        start_time: s.startTime,
        end_time: s.endTime,
        is_break: s.isBreak,
      }));

      return {
        class_id: cls.id,
        slots: solverSlots,
        days: DAYS,
        teachers: [...teacherMap.values()],
        assignments: solverAssignments,
        busy_teacher_slots: busy,
        max_solve_seconds: 15,
        // Note : la phase A (/solve mono-classe) ne lit pas encore les
        // contraintes paramétrables — utiliser /solve-multi via la page
        // /admin/timetable/generate pour bénéficier des contraintes.
      };
    });
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur préparation' };
  }

  // 2. Appel solveur
  let solverResp;
  try {
    solverResp = await callSolver(payload);
  } catch (e: unknown) {
    return {
      ok: false,
      error: `Solveur injoignable : ${e instanceof Error ? e.message : 'erreur réseau'}`,
    };
  }

  if (solverResp.status === 'INFEASIBLE' || solverResp.status === 'ERROR') {
    return { ok: false, error: solverResp.message || 'Aucune solution trouvée.' };
  }

  // 3. Persiste : wipe + recreate (remplacement complet pour cette classe)
  try {
    const placed = solverResp.placed;
    const assignmentToSubject = new Map(
      payload.assignments.map((a) => [a.id, a.subject_id]),
    );

    await withTenant(tenantId, async (tx) => {
      const cls = await tx.class.findUniqueOrThrow({
        where: { id: classId },
        select: { academicYearId: true },
      });

      // Wipe entries existantes pour cette classe
      await tx.timetableEntry.deleteMany({
        where: { classId, academicYearId: cls.academicYearId },
      });

      // Insère les nouvelles
      for (const p of placed) {
        // L'identifiant rendu par le solveur peut porter le groupe
        // (`<affectation>::<groupe>`) : on le sépare pour retrouver la matière.
        const { assignmentId, groupId } = parseSplitId(p.assignment_id);
        await tx.timetableEntry.create({
          data: {
            tenantId,
            academicYearId: cls.academicYearId,
            classId,
            slotId: p.slot_id,
            dayOfWeek: p.day,
            subjectId: assignmentToSubject.get(assignmentId) ?? p.subject_id,
            teacherId: p.teacher_id,
            groupId: p.group_id ?? groupId,
          },
        });
      }

      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'generate',
        entityType: 'Class',
        entityId: classId,
        after: {
          status: solverResp.status,
          placed: placed.length,
          unplaced: solverResp.unplaced.length,
          solverTimeMs: solverResp.solver_time_ms,
        },
      });
    });
  } catch (e: unknown) {
    return {
      ok: false,
      error: `Persistence échouée : ${e instanceof Error ? e.message : 'erreur DB'}`,
    };
  }

  revalidatePath(`/admin/classes/${classId}/timetable`);

  return {
    ok: true,
    data: {
      status: solverResp.status,
      message: solverResp.message,
      placed: solverResp.placed.length,
      unplaced: solverResp.unplaced.map((u) => ({
        subject: u.subject_label,
        requestedHours: u.requested_hours,
        placedHours: u.placed_hours,
        reason: u.reason,
      })),
      solverTimeMs: solverResp.solver_time_ms,
    },
  };
}
