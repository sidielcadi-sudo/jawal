'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import {
  proposeAllocation,
  applyAllocation,
  type AllocationPlan,
  type AllocationDecision,
} from '@/lib/teacher-allocation';
import {
  isSlotAllowedOnDay,
  readClassTimetableConstraints,
  readEffectiveTimetableSettings,
  type DayKey as SettingsDayKey,
} from '@jawal/shared';
import { classifyRoom, subjectRoomRequirement } from '@/lib/kpi-edt';
import {
  callSolverMulti,
  type ClassConstraint,
  type DayKey,
  type ForbiddenClassSlot,
  type SolverAnalysis,
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
        analysis: SolverAnalysis | null;
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
  let classRoomInfo: Record<string, { roomMode: string; homeRoomId: string | null }> = {};
  let teacherHomeRoom: Record<string, string | null> = {};

  try {
    const collected = await withTenant(tenantId, async (tx) => {
      // Phase E1 : settings établissement (jours, pause déjeuner, etc.)
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });

      const classes = await tx.class.findMany({
        where: { id: { in: classIds }, academicYearId, deletedAt: null },
        select: {
          id: true,
          name: true,
          levelId: true,
          metadata: true,
          level: { select: { cycleId: true, cycle: { select: { settings: true } } } },
        },
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
          subject: { select: { id: true, label: true, labelAr: true } },
          teacher: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              availability: true,
              metadata: true,
            },
          },
          class: { select: { id: true, name: true, nameAr: true, levelId: true } },
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
          // Phase 4E4 : type de salle requis déduit du libellé matière.
          required_room_type: subjectRoomRequirement(a.subject.label),
        };
      });

      // Profs uniques avec leurs dispos
      const teacherMap = new Map<string, SolverTeacher>();
      for (const a of assignments) {
        if (teacherMap.has(a.teacherId)) continue;
        teacherMap.set(a.teacherId, {
          id: a.teacherId,
          name: `${a.teacher.lastName} ${a.teacher.firstName}`,
          availability: (a.teacher.availability as SolverTeacher['availability']) ?? {},
        });
      }

      const rooms = await tx.room.findMany({ orderBy: { code: 'asc' } });
      const solverRooms: SolverRoom[] = rooms.map((r) => ({
        id: r.id,
        label: `${r.code} — ${r.label}`,
        // Phase 4E4 : type de salle déduit par heuristique (code/label/équipement).
        room_type: classifyRoom(r.code, r.label, r.equipment),
      }));

      const solverSlots: SolverSlot[] = slots.map((s) => ({
        id: s.id,
        start_time: s.startTime,
        end_time: s.endTime,
        is_break: s.isBreak,
      }));

      // Phase E1 : pour chaque classe, calcule les (day, slot) interdits
      // avec les settings effectifs (cycle override > tenant default).
      // Phase E2 : ajoute jours OFF + plages interdites propres à la classe,
      // et collecte max/min h/jour.
      const forbidden: ForbiddenClassSlot[] = [];
      const classConstraints: ClassConstraint[] = [];
      for (const cls of classes) {
        const cycleSettings = cls.level.cycle.settings;
        const effective = readEffectiveTimetableSettings(cycleSettings, tenant.settings);
        const classCons = readClassTimetableConstraints(cls.metadata);

        const classForbiddenDaySet = new Set(classCons.forbiddenDays);
        const classForbiddenSlotSet = new Set(
          classCons.forbiddenSlots.map((f) => `${f.day}|${f.slotId}`),
        );

        for (const d of DAYS) {
          const dayIsForbiddenForClass = classForbiddenDaySet.has(d as SettingsDayKey);
          for (const s of slots) {
            if (s.isBreak) continue;
            const settingsAllow = isSlotAllowedOnDay(
              d as SettingsDayKey,
              s.startTime,
              s.endTime,
              effective,
            );
            const classBlocks = dayIsForbiddenForClass || classForbiddenSlotSet.has(`${d}|${s.id}`);
            if (!settingsAllow || classBlocks) {
              forbidden.push({ class_id: cls.id, day: d, slot_id: s.id });
            }
          }
        }

        if (classCons.maxHoursPerDay !== null || classCons.minHoursPerDay !== null) {
          classConstraints.push({
            class_id: cls.id,
            max_hours_per_day: classCons.maxHoursPerDay,
            min_hours_per_day: classCons.minHoursPerDay,
          });
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
          case 'MAX_CONSECUTIVE_HOURS_TEACHER':
            if (typeof cfg.max === 'number') constraints.max_consecutive_hours_teacher = cfg.max;
            break;
          case 'TEACHER_LUNCH_BREAK': {
            // Calcule les créneaux (placables) chevauchant la plage déjeuner.
            const from = typeof cfg.from === 'string' ? cfg.from : '12:00';
            const to = typeof cfg.to === 'string' ? cfg.to : '14:00';
            const lunchIds = slots
              .filter((s) => !s.isBreak && s.startTime < to && s.endTime > from)
              .map((s) => s.id);
            if (lunchIds.length > 0) constraints.teacher_lunch_break_slot_ids = lunchIds;
            break;
          }
          case 'REQUIRE_SUBJECT_ROOM_TYPE':
            constraints.enforce_room_type = true;
            break;
          case 'MINIMIZE_ROOM_CHANGES':
            if (typeof cfg.weight === 'number')
              constraints.minimize_room_changes_weight = cfg.weight;
            break;
          case 'BALANCE_DAILY_LOAD':
            if (typeof cfg.weight === 'number') constraints.balance_daily_load_weight = cfg.weight;
            break;
        }
      }

      // Gestion des salles par classe : mode (homeroom/pool) hérité du cycle,
      // + salle attitrée éventuelle (fallback primaire). Sert à la persistance.
      const classRoomInfo: Record<string, { roomMode: string; homeRoomId: string | null }> = {};
      for (const cls of classes) {
        const cs = cls.level.cycle.settings as { roomMode?: string } | null;
        const md = cls.metadata as { homeRoomId?: string } | null;
        classRoomInfo[cls.id] = {
          roomMode: cs?.roomMode === 'POOL' ? 'POOL' : 'HOMEROOM',
          homeRoomId: md?.homeRoomId ?? null,
        };
      }
      // Salle principale du prof : règle dominante (le prof garde sa salle).
      const teacherHomeRoom: Record<string, string | null> = {};
      for (const a of assignments) {
        if (teacherHomeRoom[a.teacherId] !== undefined) continue;
        const md = a.teacher.metadata as { homeRoomId?: string } | null;
        teacherHomeRoom[a.teacherId] = md?.homeRoomId ?? null;
      }

      return {
        payload: {
          class_ids: classIds,
          slots: solverSlots,
          days: DAYS,
          teachers: [...teacherMap.values()],
          rooms: solverRooms,
          assignments: solverAssignments,
          // FET tourne en ~1s sur 240h ; OR-Tools peut prendre 1-3 min sur une
          // grille dense → on lui laisse 180s pour converger vers une solution complète.
          max_solve_seconds: 180,
          consecutive_bonus: 1,
          constraints,
          engine,
          forbidden_class_slots: forbidden,
          class_constraints: classConstraints,
        } as SolverMultiRequest,
        classNames: new Map(classes.map((c) => [c.id, c.name])),
        classRoomInfo,
        teacherHomeRoom,
      };
    });

    payload = collected.payload;
    classNameById = collected.classNames;
    classRoomInfo = collected.classRoomInfo;
    teacherHomeRoom = collected.teacherHomeRoom;
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
        {
          subjectId: a.subject_id,
          teacherId: a.teacher_id,
          classId: a.class_id,
          requiredRoomType: a.required_room_type ?? null,
        },
      ]),
    );

    // Affectation des SALLES (le solveur ne les place pas toujours — FET notamment).
    // Modèle « salle du prof » : un enseignant garde SA salle attitrée d'un cours
    // à l'autre (il ne donne qu'un cours à la fois → jamais de conflit avec lui-même).
    // Règle : matière spécialisée → salle du type requis (Labo PC/SVT, Info, Gymnase) ;
    // sinon → salle attitrée du prof ; repli salle de la classe / 1re salle libre.
    // Allocation conflit-free par (jour, créneau).
    const roomsByType = new Map<string, string[]>();
    for (const r of payload.rooms) {
      const ty = r.room_type ?? 'STD';
      const arr = roomsByType.get(ty) ?? [];
      arr.push(r.id);
      roomsByType.set(ty, arr);
    }
    const stdRooms = roomsByType.get('STD') ?? [];
    const classHomeRoom = new Map<string, string | null>();
    classIds.forEach((cid, i) => {
      const explicit = classRoomInfo[cid]?.homeRoomId ?? null;
      classHomeRoom.set(cid, explicit ?? (stdRooms.length ? (stdRooms[i % stdRooms.length] ?? null) : null));
    });
    // Salle attitrée effective par prof : explicite (fiche) sinon dérivée
    // (round-robin) → salle STABLE par prof pour minimiser ses changements.
    const teacherEffectiveRoom = new Map<string, string | null>();
    Object.keys(teacherHomeRoom)
      .sort()
      .forEach((tid, i) => {
        const explicit = teacherHomeRoom[tid] ?? null;
        teacherEffectiveRoom.set(
          tid,
          explicit ?? (stdRooms.length ? (stdRooms[i % stdRooms.length] ?? null) : null),
        );
      });
    const usedByCell = new Map<string, Set<string>>();
    const allocRoom = (
      data: { classId: string; teacherId: string; requiredRoomType: string | null },
      day: string,
      slotId: string,
    ): string | null => {
      const key = `${day}|${slotId}`;
      const used = usedByCell.get(key) ?? new Set<string>();
      let chosen: string | null = null;
      // 1) Matière spécialisée → salle du type requis (labo/sport/info).
      if (data.requiredRoomType && data.requiredRoomType !== 'STD') {
        chosen = (roomsByType.get(data.requiredRoomType) ?? []).find((r) => !used.has(r)) ?? null;
      }
      // 2) Salle attitrée du prof (stabilité prof — peu/pas de changement de salle).
      if (!chosen) {
        const teacherRoom = teacherEffectiveRoom.get(data.teacherId) ?? null;
        if (teacherRoom && !used.has(teacherRoom)) chosen = teacherRoom;
      }
      // 3) Repli : salle de la classe, sinon 1re salle standard libre.
      if (!chosen) {
        const home = classHomeRoom.get(data.classId) ?? null;
        chosen = home && !used.has(home) ? home : (stdRooms.find((r) => !used.has(r)) ?? null);
      }
      if (chosen) {
        used.add(chosen);
        usedByCell.set(key, used);
      }
      return chosen;
    };

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
            roomId: allocRoom(data, p.day, p.slot_id),
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
      analysis: solverResp.analysis ?? null,
    },
  };
}

// ─── Auto-affectation (Étape 2) ────────────────────────────

type ProposeResult = { ok: true; plan: AllocationPlan } | { ok: false; error: string };

/** Aperçu d'auto-affectation (lecture seule) pour les classes sélectionnées. */
export async function proposeAllocationAction(
  academicYearId: string,
  classIds: string[],
): Promise<ProposeResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  if (classIds.length === 0) return { ok: false, error: 'Sélectionnez au moins une classe.' };

  try {
    const plan = await withTenant(session.user.tenantId, (tx) =>
      proposeAllocation(tx, academicYearId, classIds),
    );
    return { ok: true, plan };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur préparation' };
  }
}

type ResetResult = { ok: true; deleted: number } | { ok: false; error: string };

/**
 * Réinitialise les classes sélectionnées : efface les affectations
 * (`TeacherAssignment`) **et** l'emploi du temps généré (`TimetableEntry`)
 * pour ces classes → vrai retour à zéro avant une nouvelle pré-affectation.
 */
export async function resetAllocationAction(
  academicYearId: string,
  classIds: string[],
): Promise<ResetResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  if (classIds.length === 0) return { ok: false, error: 'Sélectionnez au moins une classe.' };

  const tenantId = session.user.tenantId;
  try {
    const deleted = await withTenant(tenantId, async (tx) => {
      // 1) EDT généré, 2) affectations — pour repartir d'une base vierge.
      await tx.timetableEntry.deleteMany({
        where: { classId: { in: classIds }, academicYearId },
      });
      const res = await tx.teacherAssignment.deleteMany({
        where: { classId: { in: classIds }, academicYearId },
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'resetAllocation',
        entityType: 'AcademicYear',
        entityId: academicYearId,
        after: { deleted: res.count, classIds },
      });
      return res.count;
    });
    revalidatePath('/admin/timetable/generate');
    for (const cid of classIds) revalidatePath(`/admin/classes/${cid}/timetable`);
    return { ok: true, deleted };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Échec' };
  }
}

const decisionSchema = z.object({
  classId: z.string().uuid(),
  subjectId: z.string().uuid(),
  teacherId: z.string().uuid(),
  hours: z.coerce.number().min(0).max(40),
});

type ApplyResult = { ok: true; created: number } | { ok: false; error: string };

/** Applique les décisions d'auto-affectation : crée les affectations. */
export async function applyAllocationAction(
  academicYearId: string,
  decisions: AllocationDecision[],
): Promise<ApplyResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const parsed = z.array(decisionSchema).safeParse(decisions);
  if (!parsed.success) return { ok: false, error: 'Décisions invalides.' };

  const tenantId = session.user.tenantId;
  try {
    const created = await withTenant(tenantId, async (tx) => {
      const n = await applyAllocation(tx, tenantId, academicYearId, parsed.data);
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'autoAllocate',
        entityType: 'AcademicYear',
        entityId: academicYearId,
        after: { created: n, decisions: parsed.data.length },
      });
      return n;
    });
    revalidatePath('/admin/timetable/generate');
    return { ok: true, created };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Échec' };
  }
}
