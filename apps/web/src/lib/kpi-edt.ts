/**
 * Calcul des KPI « Préparation EDT » — diagnostic pré-génération.
 *
 * Tous les calculs sont en lecture seule, sans appel au solveur.
 * Permet à l'admin de vérifier que la configuration est saine AVANT
 * de lancer la génération automatique.
 */

import type { prisma } from '@jawal/db';
import { readTimetableSettings, type TimetableSettings } from '@jawal/shared';

type Tx = typeof prisma;

export type RoomType = 'STD' | 'LABO_SVT' | 'LABO_PC' | 'INFO' | 'EPS';

/** Heuristique : classifie une salle à partir de son code/label/équipement. */
export function classifyRoom(
  code: string,
  label: string,
  equipment: string[],
): RoomType {
  const text = `${code} ${label} ${equipment.join(' ')}`.toUpperCase();
  if (
    text.includes('MICROSCOPE') ||
    (text.includes('LABO') && (text.includes('SVT') || text.includes('BIO')))
  )
    return 'LABO_SVT';
  if (
    text.includes('HOTTE') ||
    (text.includes('LABO') &&
      (text.includes('PC') || text.includes('PHYSIQUE') || text.includes('CHIMIE')))
  )
    return 'LABO_PC';
  if (
    text.includes('INFO') ||
    text.includes('ORDINATEUR') ||
    text.includes(' PC ') ||
    text.includes('TABLEAU INTERACTIF')
  )
    return 'INFO';
  if (
    text.includes('GYM') ||
    text.includes('EPS') ||
    text.includes('SPORT') ||
    text.includes('TAPIS') ||
    text.includes('VESTIAIRE') ||
    text.includes('BALLON')
  )
    return 'EPS';
  return 'STD';
}

/** Heuristique : matière → type de salle requis. */
export function subjectRoomRequirement(subjectLabel: string): RoomType | null {
  const u = subjectLabel.toUpperCase();
  if (u.includes('PHYSIQUE') || u.includes('CHIMIE') || u.includes('PC ')) return 'LABO_PC';
  if (u.includes('SVT') || u.includes('BIOLOGIE') || u.includes('NATUREL'))
    return 'LABO_SVT';
  if (u.includes('INFO')) return 'INFO';
  if (u.includes('EPS') || u.includes('SPORT')) return 'EPS';
  return null;
}

export type AvailabilityMap = Partial<
  Record<'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN', Array<{ from: string; to: string }>>
>;

/** Estime la capacité hebdomadaire d'un prof à partir de sa dispo (heures × coeff). */
export function estimateTeacherCapacity(av: AvailabilityMap | null): number {
  if (!av) return 0;
  let total = 0;
  for (const day of ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const) {
    const ranges = av[day] ?? [];
    for (const r of ranges) {
      total += hhmmToMin(r.to) - hhmmToMin(r.from);
    }
  }
  // Multiplier par 0.7 pour tenir compte des heures de prép et conflits
  return Math.round((total / 60) * 0.7);
}

function hhmmToMin(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export type KpiResult = {
  coverageHours: {
    expected: number;
    available: number;
    pct: number;
  };
  classRooms: {
    classes: number;
    rooms: number;
    okPct: number;
  };
  teacherAvailability: {
    totalTeachers: number;
    teachersWithEmptyAvailability: number;
    uncoveredSlots: number;
    totalSlotCells: number;
    avgTeachersPerSlot: number;
  };
  specializedRooms: Array<{
    type: RoomType;
    available: number;
    needed: number;
    surchargePct: number;
  }>;
  matterCoherence: {
    subjectsWithoutTeacher: number;
    teachersWithoutAssignment: number;
    duplicateAssignments: number;
  };
  schedule: {
    slotsTotal: number;
    slotsPlaceable: number;
    breaks: number;
    daysActive: number;
    ok: boolean;
  };
  pedagogicalConstraints: {
    classesOverloaded: number;
    classesOk: number;
    avgWeeklyHours: number;
  };
  teacherLoad: {
    overloaded: number;
    underloaded: number;
    ok: number;
    distribution: Array<{ teacherId: string; name: string; weeklyHours: number }>;
  };
  conflicts: {
    teacher: number;
    room: number;
    class: number;
  };
  globalScore: number;
};

const TEACHER_OVERLOAD_HOURS = 24;
const TEACHER_UNDERLOAD_HOURS = 8;

/**
 * Calcule tous les KPI pour un tenant × année.
 * Doit être appelé dans un `withTenant(tx)` côté caller pour respecter RLS.
 */
export async function computeKpis(
  tx: Tx,
  tenantId: string,
  academicYearId: string,
): Promise<KpiResult> {
  const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const settings: TimetableSettings = readTimetableSettings(tenant.settings);

  // ─── KPI 1 : Couverture horaire profs ─────────────────────────
  const assignments = await tx.teacherAssignment.findMany({
    where: { academicYearId },
    select: {
      id: true,
      teacherId: true,
      hoursPerWeek: true,
      subjectId: true,
      classId: true,
      subject: { select: { label: true } },
    },
  });

  const teachers = await tx.person.findMany({
    where: { type: 'TEACHER', deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      availability: true,
    },
  });

  const expectedHours = assignments.reduce(
    (s, a) => s + (a.hoursPerWeek ?? 0),
    0,
  );
  const availableHours = teachers.reduce(
    (s, t) => s + estimateTeacherCapacity(t.availability as AvailabilityMap | null),
    0,
  );
  const coveragePct = expectedHours > 0
    ? Math.min(100, Math.round((availableHours / expectedHours) * 100))
    : 100;

  // ─── KPI 2 : Classes physiques disponibles ────────────────────
  const classes = await tx.class.findMany({
    where: { academicYearId, deletedAt: null },
    include: {
      level: { select: { label: true, cycleId: true } },
      _count: { select: { teacherAssignments: true, students: true } },
    },
  });
  const rooms = await tx.room.findMany();
  const classesCount = classes.length;
  const roomsCount = rooms.length;
  const classRoomsPct = classesCount > 0
    ? Math.min(100, Math.round((roomsCount / classesCount) * 100))
    : 100;

  // ─── KPI 3 : Disponibilités profs vs grille ───────────────────
  const slots = await tx.timetableSlot.findMany({
    orderBy: [{ order: 'asc' }, { startTime: 'asc' }],
  });
  const placeableSlots = slots.filter((s) => !s.isBreak);

  const daysActiveList = (['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const).filter(
    (d) => settings.days[d] !== 'OFF',
  );

  const totalSlotCells = placeableSlots.length * daysActiveList.length;
  let uncoveredSlots = 0;
  let teachersAvailPerCellSum = 0;

  for (const d of daysActiveList) {
    for (const s of placeableSlots) {
      let availCount = 0;
      for (const t of teachers) {
        const av = (t.availability as AvailabilityMap | null) ?? {};
        const ranges = av[d] ?? [];
        if (ranges.some((r) => r.from <= s.startTime && r.to >= s.endTime)) {
          availCount++;
        }
      }
      if (availCount === 0) uncoveredSlots++;
      teachersAvailPerCellSum += availCount;
    }
  }
  const avgTeachersPerSlot = totalSlotCells > 0
    ? Math.round((teachersAvailPerCellSum / totalSlotCells) * 10) / 10
    : 0;

  const teachersWithEmptyAv = teachers.filter((t) => {
    const av = (t.availability as AvailabilityMap | null) ?? {};
    return !Object.values(av).some((r) => r.length > 0);
  }).length;

  // ─── KPI 4 : Salles spécialisées ──────────────────────────────
  const roomsByType = new Map<RoomType, number>();
  for (const r of rooms) {
    const t = classifyRoom(r.code, r.label, r.equipment);
    roomsByType.set(t, (roomsByType.get(t) ?? 0) + 1);
  }
  // Estimation des besoins par type via les matières et leurs hoursPerWeek
  const needsByType = new Map<RoomType, number>();
  for (const a of assignments) {
    const req = subjectRoomRequirement(a.subject.label);
    if (req && a.hoursPerWeek) {
      needsByType.set(req, (needsByType.get(req) ?? 0) + a.hoursPerWeek);
    }
  }
  const specialized: KpiResult['specializedRooms'] = [];
  for (const t of ['LABO_PC', 'LABO_SVT', 'INFO', 'EPS', 'STD'] as RoomType[]) {
    const available = roomsByType.get(t) ?? 0;
    const needed = needsByType.get(t) ?? 0;
    // Capacité = available × daysActive × placeableSlots (1 cours par cellule)
    const capacity = available * daysActiveList.length * placeableSlots.length;
    const surchargePct = capacity > 0
      ? Math.max(0, Math.round(((needed - capacity) / capacity) * 100))
      : (needed > 0 ? 100 : 0);
    specialized.push({ type: t, available, needed, surchargePct });
  }

  // ─── KPI 5 : Cohérence matière → prof → classe ────────────────
  const curriculum = await tx.curriculumSubject.findMany({
    select: { levelId: true, subjectId: true },
  });
  const curriculumByLevel = new Map<string, Set<string>>();
  for (const c of curriculum) {
    if (!curriculumByLevel.has(c.levelId))
      curriculumByLevel.set(c.levelId, new Set());
    curriculumByLevel.get(c.levelId)!.add(c.subjectId);
  }

  // Subjects sans teacher pour une classe donnée
  const assignedKeys = new Set<string>(
    assignments.map((a) => `${a.classId}|${a.subjectId}`),
  );
  let subjectsWithoutTeacher = 0;
  for (const cls of classes) {
    const subjects = curriculumByLevel.get(cls.levelId) ?? new Set();
    for (const subj of subjects) {
      if (!assignedKeys.has(`${cls.id}|${subj}`)) subjectsWithoutTeacher++;
    }
  }

  const teachersUsed = new Set(assignments.map((a) => a.teacherId));
  const teachersWithoutAssignment = teachers.filter(
    (t) => !teachersUsed.has(t.id),
  ).length;

  // Doublons : même (classId, subjectId) avec ≥ 2 assignments
  const assignmentDupCount = new Map<string, number>();
  for (const a of assignments) {
    const k = `${a.classId}|${a.subjectId}`;
    assignmentDupCount.set(k, (assignmentDupCount.get(k) ?? 0) + 1);
  }
  let duplicateAssignments = 0;
  for (const c of assignmentDupCount.values()) {
    if (c >= 2) duplicateAssignments += c - 1;
  }

  // ─── KPI 6 : Grille horaire ───────────────────────────────────
  const scheduleOk =
    slots.length >= 4 && // au moins 4 créneaux
    slots.some((s) => s.isBreak) && // au moins une pause
    daysActiveList.length >= 3; // au moins 3 jours actifs

  // ─── KPI 7 : Contraintes pédagogiques ─────────────────────────
  // On compare volume hebdo demandé vs capacité jours actifs × max h/jour
  const hoursByClass = new Map<string, number>();
  for (const a of assignments) {
    hoursByClass.set(a.classId, (hoursByClass.get(a.classId) ?? 0) + (a.hoursPerWeek ?? 0));
  }
  const maxHoursPerDayDefault = placeableSlots.length;
  let classesOverloaded = 0;
  let classesOk = 0;
  for (const cls of classes) {
    const total = hoursByClass.get(cls.id) ?? 0;
    const capacity = daysActiveList.length * maxHoursPerDayDefault;
    if (total > capacity) classesOverloaded++;
    else classesOk++;
  }
  const avgWeeklyHours = classes.length > 0
    ? Math.round(
        ([...hoursByClass.values()].reduce((s, h) => s + h, 0) / classes.length) * 10,
      ) / 10
    : 0;

  // ─── KPI 8 : Charge horaire profs ─────────────────────────────
  const hoursByTeacher = new Map<string, number>();
  for (const a of assignments) {
    hoursByTeacher.set(
      a.teacherId,
      (hoursByTeacher.get(a.teacherId) ?? 0) + (a.hoursPerWeek ?? 0),
    );
  }
  const distribution = teachers
    .map((t) => ({
      teacherId: t.id,
      name: `${t.lastName} ${t.firstName}`,
      weeklyHours: hoursByTeacher.get(t.id) ?? 0,
    }))
    .sort((a, b) => b.weeklyHours - a.weeklyHours);
  let overloaded = 0;
  let underloaded = 0;
  let okLoad = 0;
  for (const d of distribution) {
    if (d.weeklyHours > TEACHER_OVERLOAD_HOURS) overloaded++;
    else if (d.weeklyHours > 0 && d.weeklyHours < TEACHER_UNDERLOAD_HOURS) underloaded++;
    else if (d.weeklyHours > 0) okLoad++;
  }

  // ─── KPI 9 : Conflits structurels (sur EDT existant) ──────────
  const entries = await tx.timetableEntry.findMany({
    where: { academicYearId },
    select: { id: true, classId: true, slotId: true, dayOfWeek: true, teacherId: true, roomId: true },
  });
  let teacherConflicts = 0;
  let roomConflicts = 0;
  const classKeys = new Map<string, number>();
  const teacherKeys = new Map<string, number>();
  const roomKeys = new Map<string, number>();
  for (const e of entries) {
    const cellKey = `${e.dayOfWeek}|${e.slotId}`;
    classKeys.set(`${e.classId}|${cellKey}`, (classKeys.get(`${e.classId}|${cellKey}`) ?? 0) + 1);
    if (e.teacherId)
      teacherKeys.set(
        `${e.teacherId}|${cellKey}`,
        (teacherKeys.get(`${e.teacherId}|${cellKey}`) ?? 0) + 1,
      );
    if (e.roomId)
      roomKeys.set(
        `${e.roomId}|${cellKey}`,
        (roomKeys.get(`${e.roomId}|${cellKey}`) ?? 0) + 1,
      );
  }
  for (const c of teacherKeys.values()) if (c > 1) teacherConflicts += c - 1;
  for (const c of roomKeys.values()) if (c > 1) roomConflicts += c - 1;
  let classConflicts = 0;
  for (const c of classKeys.values()) if (c > 1) classConflicts += c - 1;

  // ─── Score global (pondération) ──────────────────────────────
  const coverageScore = coveragePct; // 0-100
  const classRoomsScore = classRoomsPct; // 0-100
  const teacherAvScore = totalSlotCells > 0
    ? Math.max(0, 100 - Math.round((uncoveredSlots / totalSlotCells) * 200))
    : 100;
  const specializedScore = (() => {
    const surcharges = specialized.filter((s) => s.type !== 'STD' && s.needed > 0);
    if (surcharges.length === 0) return 100;
    const avg = surcharges.reduce((s, x) => s + x.surchargePct, 0) / surcharges.length;
    return Math.max(0, 100 - Math.round(avg));
  })();
  const matterScore = (() => {
    const total = subjectsWithoutTeacher + duplicateAssignments;
    return total === 0 ? 100 : Math.max(0, 100 - total * 5);
  })();
  const scheduleScore = scheduleOk ? 100 : 30;
  const constraintsScore = classes.length > 0
    ? Math.round((classesOk / classes.length) * 100)
    : 100;
  const teacherLoadScore = distribution.length > 0
    ? Math.max(0, 100 - Math.round(((overloaded + underloaded) / distribution.length) * 100))
    : 100;
  const conflictsScore = teacherConflicts + roomConflicts + classConflicts === 0 ? 100 : 50;

  const globalScore = Math.round(
    coverageScore * 0.25 +
      classRoomsScore * 0.1 +
      teacherAvScore * 0.15 +
      specializedScore * 0.1 +
      matterScore * 0.15 +
      scheduleScore * 0.05 +
      constraintsScore * 0.1 +
      teacherLoadScore * 0.05 +
      conflictsScore * 0.05,
  );

  return {
    coverageHours: {
      expected: expectedHours,
      available: availableHours,
      pct: coveragePct,
    },
    classRooms: { classes: classesCount, rooms: roomsCount, okPct: classRoomsPct },
    teacherAvailability: {
      totalTeachers: teachers.length,
      teachersWithEmptyAvailability: teachersWithEmptyAv,
      uncoveredSlots,
      totalSlotCells,
      avgTeachersPerSlot,
    },
    specializedRooms: specialized,
    matterCoherence: {
      subjectsWithoutTeacher,
      teachersWithoutAssignment,
      duplicateAssignments,
    },
    schedule: {
      slotsTotal: slots.length,
      slotsPlaceable: placeableSlots.length,
      breaks: slots.filter((s) => s.isBreak).length,
      daysActive: daysActiveList.length,
      ok: scheduleOk,
    },
    pedagogicalConstraints: {
      classesOverloaded,
      classesOk,
      avgWeeklyHours,
    },
    teacherLoad: {
      overloaded,
      underloaded,
      ok: okLoad,
      distribution,
    },
    conflicts: {
      teacher: teacherConflicts,
      room: roomConflicts,
      class: classConflicts,
    },
    globalScore,
  };
}
