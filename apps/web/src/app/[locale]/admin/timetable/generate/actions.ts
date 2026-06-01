'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import {
  isSlotAllowedOnDay,
  readTimetableSettings,
  type DayKey as SettingsDayKey,
} from '@jawal/shared';
import {
  callSolverMulti,
  type DayKey,
  type ForbiddenClassSlot,
  type SolverAssignment,
  type SolverConstraints,
  type SolverEngine,
  type SolverMultiRequest,
  type SolverRoom,
  type SolverSlot,
  type SolverTeacher,
} from '@/lib/solver-client';

type ClassResult = {
  classId: string;
  className: string;
  placed: number;
  unplaced: Array<{ subject: string; placedHours: number; requestedHours: number; reason: string }>;
};

type Result =
  | {
      ok: true;
      data: {
        status: string;
        message: string;
        totalPlaced: number;
        consecutiveBlocks: number;
        solverTimeMs: number;
        byClass: ClassResult[];
      };
    }
  | { ok: false; error: string };

const DAYS: DayKey[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export async function generateMultiTimetableAction(
  academicYearId: string,
  classIds: string[],
  engine: SolverEngine = 'ortools',
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  if (classIds.length === 0) {
    return { ok: false, error: 'Sélectionnez au moins une classe.' };
  }

  const tenantId = session.user.tenantId;

  let payload: SolverMultiRequest;
  let classNameById: Map<string, string>;

  try {
    const collected = await withTenant(tenantId, async (tx) => {
      // Phase E1 : settings établissement (jours, pause déjeuner, etc.)
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      const ttSettings = readTimetableSettings(tenant.settings);

      const classes = await tx.class.findMany({
        where: { id: { in: classIds }, academicYearId, deletedAt: null },
        select: { id: true, name: true, levelId: true },
      });
      if (classes.length !== classIds.length) {
        throw new Error('Certaines classes sont introuvables ou archivées.');
      }

      const slots = await tx.timetableSlot.findMany({
        orderBy: [{ order: 'asc' }, { startTime: 'asc' }],
      });
      if (slots.length === 0) {
        throw new Error('Aucun créneau horaire défini — créez la grille dans Paramètres.');
      }

      const assignments = await tx.teacherAssignment.findMany({
        where: { classId: { in: classIds }, academicYearId },
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
          class: { select: { id: true, name: true, levelId: true } },
        },
      });

      if (assignments.length === 0) {
        throw new Error('Aucune affectation pédagogique pour ces classes.');
      }

      // Volume horaire avec fallback CurriculumSubject
      const levelIds = [...new Set(classes.map((c) => c.levelId))];
      const curriculum = await tx.curriculumSubject.findMany({
        where: { levelId: { in: levelIds } },
      });
      const curriculumByKey = new Map(
        curriculum.map((c) => [`${c.levelId}|${c.subjectId}`, c.weeklyHours]),
      );

      const solverAssignments: SolverAssignment[] = assignments.map((a) => {
        const fallback = curriculumByKey.get(`${a.class.levelId}|${a.subjectId}`) ?? 0;
        const hours = a.hoursPerWeek ?? fallback;
        return {
          id: a.id,
          teacher_id: a.teacherId,
          subject_id: a.subjectId,
          subject_label: a.subject.label,
          class_id: a.classId,
          class_name: a.class.name,
          weekly_hours: Math.max(0, Math.round(hours)),
        };
      });

      // Profs uniques avec leurs dispos
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

      const rooms = await tx.room.findMany({ orderBy: { code: 'asc' } });
      const solverRooms: SolverRoom[] = rooms.map((r) => ({
        id: r.id,
        label: `${r.code} — ${r.label}`,
      }));

      const solverSlots: SolverSlot[] = slots.map((s) => ({
        id: s.id,
        start_time: s.startTime,
        end_time: s.endTime,
        is_break: s.isBreak,
      }));

      // Phase E1 : calcule la liste (day, slot) interdits depuis les settings
      const forbidden: ForbiddenClassSlot[] = [];
      for (const d of DAYS) {
        for (const s of slots) {
          if (s.isBreak) continue;
          const allowed = isSlotAllowedOnDay(
            d as SettingsDayKey,
            s.startTime,
            s.endTime,
            ttSettings,
          );
          if (!allowed) {
            forbidden.push({ day: d, slot_id: s.id });
          }
        }
      }

      // Contraintes paramétrables (TimetableConstraint actives)
      const constraintRows = await tx.timetableConstraint.findMany({
        where: { enabled: true },
      });
      const constraints: SolverConstraints = {};
      for (const c of constraintRows) {
        const cfg = (c.config as Record<string, unknown>) ?? {};
        switch (c.kind) {
          case 'MAX_SAME_SUBJECT_PER_DAY':
            if (typeof cfg.max === 'number') constraints.max_same_subject_per_day = cfg.max;
            break;
          case 'NO_GAPS':
            if (typeof cfg.weight === 'number') constraints.no_gaps_weight = cfg.weight;
            break;
          case 'REQUIRES_CONSECUTIVE_SUBJECTS':
            if (Array.isArray(cfg.subjectIds))
              constraints.consecutive_subject_ids = cfg.subjectIds as string[];
            break;
          case 'MAX_HOURS_PER_DAY_TEACHER':
            if (typeof cfg.max === 'number') constraints.max_hours_per_day_teacher = cfg.max;
            break;
        }
      }

      return {
        payload: {
          class_ids: classIds,
          slots: solverSlots,
          days: DAYS,
          teachers: [...teacherMap.values()],
          rooms: solverRooms,
          assignments: solverAssignments,
          // FET tourne en ~1s sur 240h ; OR-Tools peut prendre 1-3 min.
          max_solve_seconds: engine === 'fet' ? 180 : 60,
          consecutive_bonus: 1,
          constraints,
          engine,
          forbidden_class_slots: forbidden,
        } as SolverMultiRequest,
        classNames: new Map(classes.map((c) => [c.id, c.name])),
      };
    });

    payload = collected.payload;
    classNameById = collected.classNames;
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur préparation' };
  }

  let solverResp;
  try {
    solverResp = await callSolverMulti(payload);
  } catch (e: unknown) {
    return {
      ok: false,
      error: `Solveur injoignable : ${e instanceof Error ? e.message : 'réseau'}`,
    };
  }

  if (solverResp.status === 'INFEASIBLE' || solverResp.status === 'ERROR') {
    return { ok: false, error: solverResp.message || 'Aucune solution trouvée.' };
  }

  // Persistance : wipe + recreate pour TOUTES les classes ciblées
  try {
    const assignmentToData = new Map(
      payload.assignments.map((a) => [
        a.id,
        { subjectId: a.subject_id, teacherId: a.teacher_id, classId: a.class_id },
      ]),
    );

    await withTenant(tenantId, async (tx) => {
      // Wipe sur toutes les classes ciblées
      await tx.timetableEntry.deleteMany({
        where: { classId: { in: classIds }, academicYearId },
      });

      for (const p of solverResp.placed) {
        const data = assignmentToData.get(p.assignment_id);
        if (!data) continue;
        await tx.timetableEntry.create({
          data: {
            tenantId,
            academicYearId,
            classId: data.classId,
            slotId: p.slot_id,
            dayOfWeek: p.day,
            subjectId: data.subjectId,
            teacherId: data.teacherId,
            roomId: p.room_id ?? null,
          },
        });
      }

      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'generateMulti',
        entityType: 'AcademicYear',
        entityId: academicYearId,
        after: {
          status: solverResp.status,
          classIds,
          placed: solverResp.placed.length,
          consecutiveBlocks: solverResp.consecutive_blocks,
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

  revalidatePath('/admin/timetable/generate');
  for (const cid of classIds) {
    revalidatePath(`/admin/classes/${cid}/timetable`);
  }

  // Agrège par classe pour le rapport
  const placedByClass = new Map<string, number>();
  for (const p of solverResp.placed) {
    placedByClass.set(p.class_id, (placedByClass.get(p.class_id) ?? 0) + 1);
  }
  const unplacedByClass = new Map<string, ClassResult['unplaced']>();
  for (const u of solverResp.unplaced) {
    const meta = payload.assignments.find((a) => a.id === u.assignment_id);
    if (!meta) continue;
    const arr = unplacedByClass.get(meta.class_id) ?? [];
    arr.push({
      subject: u.subject_label,
      placedHours: u.placed_hours,
      requestedHours: u.requested_hours,
      reason: u.reason,
    });
    unplacedByClass.set(meta.class_id, arr);
  }

  const byClass: ClassResult[] = classIds.map((cid) => ({
    classId: cid,
    className: classNameById.get(cid) ?? cid,
    placed: placedByClass.get(cid) ?? 0,
    unplaced: unplacedByClass.get(cid) ?? [],
  }));

  return {
    ok: true,
    data: {
      status: solverResp.status,
      message: solverResp.message,
      totalPlaced: solverResp.placed.length,
      consecutiveBlocks: solverResp.consecutive_blocks,
      solverTimeMs: solverResp.solver_time_ms,
      byClass,
    },
  };
}
