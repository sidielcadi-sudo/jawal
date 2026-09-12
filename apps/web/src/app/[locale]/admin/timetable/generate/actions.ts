'use server';

import { revalidatePath } from 'next/cache';
import {
  runPreflight,
  blockingMessage,
  warningMessage,
} from '@/lib/timetable-preflight';

import { z } from 'zod';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { parseSplitId, splitAssignment } from '@/lib/timetable-split-load';
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
          class: { select: { id: true, name: true, nameAr: true, levelId: true, trackId: true } },
        },
      });

      if (assignments.length === 0) {
        throw new Error('Aucune affectation pédagogique pour ces classes.');
      }

      // Volume horaire par cascade : affectation → filière → niveau.
      // Cf. lib/timetable-load. La génération globale mêle des classes de
      // cycles différents : chacune doit résoudre sur SA source.
      const levelIds = [...new Set(assignments.map((a) => a.class.levelId))];
      const trackIds = [
        ...new Set(assignments.map((a) => a.class.trackId).filter((x): x is string => !!x)),
      ];
      const [curriculum, trackRows] = await Promise.all([
        tx.curriculumSubject.findMany({ where: { levelId: { in: levelIds } } }),
        trackIds.length
          ? tx.trackSubjectCoefficient.findMany({
              where: { trackId: { in: trackIds } },
              select: { trackId: true, subjectId: true, weeklyHours: true },
            })
          : Promise.resolve([]),
      ]);
      const curriculumByKey = new Map(
        curriculum.map((c) => [`${c.levelId}|${c.subjectId}`, c.weeklyHours]),
      );
      const trackByKey = new Map(
        trackRows.map((r) => [`${r.trackId}|${r.subjectId}`, r.weeklyHours]),
      );

      // Groupes des classes du lot : une matière dédoublée devient plusieurs
      // lignes synchronisées (cf. lib/timetable-split-load).
      const groupRows = await tx.classGroup.findMany({
        where: { classId: { in: classIds } },
        select: { id: true, classId: true, subjectId: true, splitHours: true, teacherId: true },
        orderBy: [{ order: 'asc' }, { name: 'asc' }],
      });
      const groupsByKey = new Map<string, typeof groupRows>();
      for (const g of groupRows) {
        if (!g.subjectId) continue;
        const k = `${g.classId}|${g.subjectId}`;
        const arr = groupsByKey.get(k) ?? [];
        arr.push(g);
        groupsByKey.set(k, arr);
      }

      // Séances déclarées en groupes : « le lundi de 10 h à 12 h est
      // dédoublé ». Elles imposent la case au solveur — sans elles il en
      // choisissait une au hasard, et l'appel comme les notes se rattachaient
      // à une séance que personne n'avait décidée.
      const splitSlotRows = await tx.classGroupSlot.findMany({
        where: { classId: { in: classIds } },
        select: { classId: true, subjectId: true, dayOfWeek: true, slotId: true },
      });
      const splitSlotsByKey = new Map<string, Array<{ day: string; slotId: string }>>();
      for (const r of splitSlotRows) {
        const k = `${r.classId}|${r.subjectId}`;
        const arr = splitSlotsByKey.get(k) ?? [];
        arr.push({ day: r.dayOfWeek, slotId: r.slotId });
        splitSlotsByKey.set(k, arr);
      }

      const solverAssignments: SolverAssignment[] = assignments.flatMap((a) => {
        const fromTrack = a.class.trackId
          ? trackByKey.get(`${a.class.trackId}|${a.subjectId}`)
          : undefined;
        const fromCurriculum = curriculumByKey.get(`${a.class.levelId}|${a.subjectId}`);
        const hours = a.hoursPerWeek ?? fromTrack ?? fromCurriculum ?? 0;
        const groups = groupsByKey.get(`${a.classId}|${a.subjectId}`) ?? [];
        if (groups.length >= 2) {
          return splitAssignment({
            assignmentId: a.id,
            teacherId: a.teacherId,
            subjectId: a.subjectId,
            subjectLabel: a.subject.label,
            classId: a.classId,
            className: a.class.name,
            weeklyHours: hours,
            groups: groups.map((g) => ({ id: g.id, teacherId: g.teacherId })),
            splitHours: groups[0]?.splitHours ?? null,
            fixedSlots: splitSlotsByKey.get(`${a.classId}|${a.subjectId}`) ?? [],
            requiredRoomType: subjectRoomRequirement(a.subject.label),
          });
        }
        return [{
          id: a.id,
          teacher_id: a.teacherId,
          subject_id: a.subjectId,
          subject_label: a.subject.label,
          class_id: a.classId,
          class_name: a.class.name,
          weekly_hours: Math.max(0, Math.round(hours)),
          // Phase 4E4 : type de salle requis déduit du libellé matière.
          required_room_type: subjectRoomRequirement(a.subject.label),
        }];
      });

      // Profs uniques avec leurs dispos.
      //
      // Les enseignants de groupe s'ajoutent : un dédoublement confie souvent
      // une moitié à un professeur qui n'est affecté à aucune classe du lot.
      const teacherMap = new Map<string, SolverTeacher>();
      for (const a of assignments) {
        if (teacherMap.has(a.teacherId)) continue;
        teacherMap.set(a.teacherId, {
          id: a.teacherId,
          name: `${a.teacher.lastName} ${a.teacher.firstName}`,
          availability: (a.teacher.availability as SolverTeacher['availability']) ?? {},
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


  // ── Diagnostic avant solveur ──────────────────────────────────────────
  //
  // Les solveurs disent mal pourquoi ils échouent : FET rejette le fichier
  // entier sur « Cannot precompute - data is wrong » sans nommer la classe ni
  // la contrainte fautive. On regarde donc les données d'abord, et on rend un
  // message qui désigne ce qu'il faut corriger. Les avertissements, eux, ne
  // retiennent pas la génération : ils accompagnent son résultat.
  const preflight = runPreflight({
    slots: payload.slots,
    days: payload.days,
    teachers: payload.teachers,
    assignments: payload.assignments,
    forbiddenClassSlots: payload.forbidden_class_slots ?? [],
    maxSameSubjectPerDay: payload.constraints?.max_same_subject_per_day ?? null,
  });
  const blocked = blockingMessage(preflight);
  if (blocked) return { ok: false, error: blocked };
  const preflightWarning = warningMessage(preflight);

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
    // Rien n'a été détecté en amont et le solveur échoue quand même : on rend
    // son message, mais on y joint ce qu'on sait de fragile dans les données —
    // c'est en général là que se trouve l'explication.
    const detail = solverResp.message || 'Aucune solution trouvée.';
    return { ok: false, error: preflightWarning ? `${detail}\n${preflightWarning}` : detail };
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
          // Groupe visé, pour les séances issues d'un dédoublement.
          groupId: a.group_id ?? null,
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
            // Le solveur renvoie le groupe ; l'identifiant composite sert de
            // repli si le moteur ne le propage pas (cas de FET).
            groupId: p.group_id ?? data.groupId ?? parseSplitId(p.assignment_id).groupId,
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
      // Ce que le pré-diagnostic a relevé accompagne le résultat : la
      // génération a bien abouti, mais l'utilisateur doit savoir ce qui a été
      // dégradé au passage.
      message: preflightWarning
        ? `${solverResp.message}\n${preflightWarning}`
        : solverResp.message,
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
/**
 * Ce que la réinitialisation détruirait, avant de la lancer.
 *
 * Une suppression qui annonce « action irréversible » sans dire ce qu'elle
 * emporte n'informe personne : on clique en pensant remettre à zéro un
 * brouillon, et 252 affectations disparaissent. Le journal ne conserve que le
 * compte, pas le contenu — il n'y a pas de retour en arrière.
 */
export async function previewResetAllocationAction(
  academicYearId: string,
  classIds: string[],
): Promise<
  { ok: true; assignments: number; entries: number; classes: number } | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  if (classIds.length === 0) return { ok: true, assignments: 0, entries: 0, classes: 0 };

  try {
    return await withTenant(session.user.tenantId, async (tx) => {
      const [assignments, entries] = await Promise.all([
        tx.teacherAssignment.count({ where: { classId: { in: classIds }, academicYearId } }),
        tx.timetableEntry.count({ where: { classId: { in: classIds }, academicYearId } }),
      ]);
      return { ok: true as const, assignments, entries, classes: classIds.length };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

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
