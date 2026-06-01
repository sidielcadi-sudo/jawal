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
        select: { id: true, name: true, academicYearId: true, levelId: true },
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
          subject: { select: { id: true, label: true } },
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

      // Volume horaire cible : si TeacherAssignment.hoursPerWeek est null,
      // on retombe sur CurriculumSubject pour le (level × subject).
      const curriculum = await tx.curriculumSubject.findMany({
        where: { levelId: cls.levelId },
      });
      const curriculumByKey = new Map(
        curriculum.map((c) => [c.subjectId, c.weeklyHours]),
      );

      const solverAssignments: SolverAssignment[] = assignments.map((a) => {
        const fallbackHours = curriculumByKey.get(a.subjectId) ?? 0;
        const hours = a.hoursPerWeek ?? fallbackHours;
        return {
          id: a.id,
          teacher_id: a.teacherId,
          subject_id: a.subjectId,
          subject_label: a.subject.label,
          class_id: cls.id,
          class_name: cls.name,
          weekly_hours: Math.max(0, Math.round(hours)),
        };
      });

      // Profs uniques avec dispo
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
        await tx.timetableEntry.create({
          data: {
            tenantId,
            academicYearId: cls.academicYearId,
            classId,
            slotId: p.slot_id,
            dayOfWeek: p.day,
            subjectId: assignmentToSubject.get(p.assignment_id) ?? p.subject_id,
            teacherId: p.teacher_id,
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
