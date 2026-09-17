import 'server-only';
import type { Prisma } from '@/lib/db';
import { dowOf, parseDateUTC, addDays } from '@/lib/lesson-book';
import { categoryOf, countsPresent, type AttendanceCategory } from '@/lib/attendance-category';

type Tx = Prisma.TransactionClient;

/** periodLabel d'une session = "{startTime}-{endTime}" (cf. teacher-attendance.ts). */
const periodLabelOf = (start: string, end: string) => `${start}-${end}`;

/** Colonnes du tableau réellement alimentées par les données. */
export type BoardCol =
  | 'absRA'
  | 'absNonRA'
  | 'retards'
  | 'exclCours'
  | 'incidents'
  | 'infirmerie'
  | 'presents'
  | 'appelsNonFaits';

export const BOARD_COLS: BoardCol[] = [
  'absRA',
  'absNonRA',
  'retards',
  'exclCours',
  'incidents',
  'infirmerie',
  'presents',
  'appelsNonFaits',
];

type Counts = Record<BoardCol, number>;

const zeroCounts = (): Counts => ({
  absRA: 0,
  absNonRA: 0,
  retards: 0,
  exclCours: 0,
  incidents: 0,
  infirmerie: 0,
  presents: 0,
  appelsNonFaits: 0,
});

export type BoardRow = {
  /** Clé = periodLabel, sert aux liens du panneau de détail. */
  periodLabel: string;
  startTime: string;
  endTime: string;
  label: string | null;
  counts: Counts;
};

export type DailyBoard = {
  rows: BoardRow[];
  totals: Counts;
  /** Convocations du jour (niveau jour, sans lien créneau). */
  convocations: number;
};

type RecordLike = {
  status: string;
  infirmary: boolean;
  punishment: boolean;
  exclusion: boolean;
  justification: { status: string } | null;
};

/** Le record `r` correspond-il à la colonne `col` ? (logique partagée grille/détail) */
function matchesCol(r: RecordLike, col: BoardCol): boolean {
  const cat = categoryOf(r);
  switch (col) {
    case 'presents':
      return countsPresent(cat);
    case 'retards':
      return r.status === 'LATE';
    case 'exclCours':
      // Compté depuis le carnet de correspondance (cf. loadDailyBoard).
      return false;
    case 'incidents':
      return r.punishment;
    case 'infirmerie':
      return r.infirmary;
    case 'absRA':
      return cat === 'ABSENT' && r.justification?.status === 'APPROVED';
    case 'absNonRA':
      return cat === 'ABSENT' && r.justification?.status !== 'APPROVED';
    default:
      return false;
  }
}

/**
 * Tableau de bord journalier de la Vie scolaire : une ligne par créneau horaire,
 * des compteurs par type d'événement, et la ligne des totaux. À appeler dans un
 * `withTenant`.
 */
export async function loadDailyBoard(
  tx: Tx,
  {
    date,
    classId,
    studentId,
    classIds,
  }: {
    date: string;
    classId?: string | null;
    studentId?: string | null;
    /** Périmètre d'un cycle : ses classes. Ignoré si une classe ou un élève est choisi. */
    classIds?: string[] | null;
  },
): Promise<DailyBoard> {
  const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });

  const slots = await tx.timetableSlot.findMany({
    where: { isBreak: false },
    orderBy: { order: 'asc' },
    select: { startTime: true, endTime: true, label: true },
  });

  const dateObj = parseDateUTC(date);
  const nextDay = parseDateUTC(addDays(date, 1));

  // Un élève sélectionné définit le périmètre : on restreint aux classes où il
  // est inscrit (priorité sur le filtre classe).
  let scopeClassIds: string[] | null = null;
  if (studentId) {
    const scs = await tx.studentClass.findMany({
      where: { studentId, unenrolledAt: null },
      select: { classId: true },
    });
    scopeClassIds = scs.map((s) => s.classId);
  } else if (classId) {
    scopeClassIds = [classId];
  } else if (classIds) {
    scopeClassIds = classIds;
  }
  const classWhere = scopeClassIds ? { classId: { in: scopeClassIds } } : {};

  // Convocations du jour (niveau jour).
  const convocations = await tx.carnetEntry.count({
    where: {
      type: 'CONVOCATION',
      occurredAt: { gte: dateObj, lt: nextDay },
      ...(studentId ? { studentId } : {}),
    },
  });

  if (!year) {
    return {
      rows: slots.map((s) => ({
        periodLabel: periodLabelOf(s.startTime, s.endTime),
        startTime: s.startTime,
        endTime: s.endTime,
        label: s.label,
        counts: zeroCounts(),
      })),
      totals: zeroCounts(),
      convocations,
    };
  }

  const dow = dowOf(date);

  const [entries, sessions] = await Promise.all([
    tx.timetableEntry.findMany({
      where: {
        academicYearId: year.id,
        dayOfWeek: dow,
        slot: { isBreak: false },
        ...classWhere,
      },
      select: { classId: true, slot: { select: { startTime: true, endTime: true } } },
    }),
    tx.attendanceSession.findMany({
      where: { date: dateObj, ...classWhere },
      select: {
        id: true,
        classId: true,
        periodLabel: true,
        finalizedAt: true,
        records: {
          ...(studentId ? { where: { studentId } } : {}),
          select: {
            status: true,
            infirmary: true,
            punishment: true,
            exclusion: true,
            justification: { select: { status: true } },
          },
        },
      },
    }),
  ]);

  // Sessions finalisées (classId|periodLabel) → base des « appels non faits ».
  const finalizedSet = new Set(
    sessions.filter((s) => s.finalizedAt).map((s) => `${s.classId}|${s.periodLabel ?? ''}`),
  );

  const sessionsByPeriod = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const key = s.periodLabel ?? '';
    if (!key) continue;
    const arr = sessionsByPeriod.get(key) ?? [];
    arr.push(s);
    sessionsByPeriod.set(key, arr);
  }

  const expectedByPeriod = new Map<string, { classId: string }[]>();
  for (const e of entries) {
    const key = periodLabelOf(e.slot.startTime, e.slot.endTime);
    const arr = expectedByPeriod.get(key) ?? [];
    arr.push({ classId: e.classId });
    expectedByPeriod.set(key, arr);
  }

  // Lignes = créneaux (ordre EDT) + tout periodLabel de session hors créneaux.
  const rowKeys: { periodLabel: string; startTime: string; endTime: string; label: string | null }[] =
    slots.map((s) => ({
      periodLabel: periodLabelOf(s.startTime, s.endTime),
      startTime: s.startTime,
      endTime: s.endTime,
      label: s.label,
    }));
  const known = new Set(rowKeys.map((r) => r.periodLabel));
  for (const key of sessionsByPeriod.keys()) {
    if (known.has(key)) continue;
    const [startTime = key, endTime = ''] = key.split('-');
    rowKeys.push({ periodLabel: key, startTime, endTime, label: null });
  }

  const totals = zeroCounts();
  const rows: BoardRow[] = rowKeys.map((rk) => {
    const counts = zeroCounts();
    for (const sess of sessionsByPeriod.get(rk.periodLabel) ?? []) {
      for (const r of sess.records) {
        for (const col of BOARD_COLS) {
          if (col !== 'appelsNonFaits' && matchesCol(r, col)) counts[col] += 1;
        }
      }
    }
    for (const e of expectedByPeriod.get(rk.periodLabel) ?? []) {
      if (!finalizedSet.has(`${e.classId}|${rk.periodLabel}`)) counts.appelsNonFaits += 1;
    }
    for (const col of BOARD_COLS) totals[col] += counts[col];
    return { ...rk, counts };
  });

  // Exclusions : signalées dans le carnet de correspondance, plus à l'appel.
  // Rattachées au créneau de la séance d'origine, sinon à celui de l'heure
  // de saisie ; à défaut, elles ne comptent qu'au total du jour.
  const exclusions = await tx.carnetEntry.findMany({
    where: {
      type: 'EXCLUSION',
      occurredAt: { gte: dateObj, lt: nextDay },
      ...(studentId ? { studentId } : {}),
      ...(scopeClassIds ? { classId: { in: scopeClassIds } } : {}),
    },
    select: { occurredAt: true, attendanceSessionId: true },
  });
  const periodBySession = new Map(sessions.map((s) => [s.id, s.periodLabel ?? '']));
  for (const ex of exclusions) {
    const hhmm = ex.occurredAt.toISOString().slice(11, 16);
    const label =
      (ex.attendanceSessionId ? periodBySession.get(ex.attendanceSessionId) : '') ||
      rows.find((r) => r.startTime <= hhmm && hhmm < r.endTime)?.periodLabel ||
      '';
    const row = rows.find((r) => r.periodLabel === label);
    if (row) row.counts.exclCours += 1;
    totals.exclCours += 1;
  }

  return { rows, totals, convocations };
}

export type SlotDetailRow = {
  recordId: string;
  studentId: string;
  name: string;
  className: string;
  category: AttendanceCategory;
  reasonId: string | null;
  reasonLabel: string | null;
  note: string | null;
  subject: string | null;
  teacher: string | null;
  justifStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  /** Absence régularisée = justification approuvée (case RA cochée). */
  isRA: boolean;
};

/**
 * Détail des élèves concernés par (créneau × colonne) un jour donné, groupés par
 * classe — alimente le panneau sous la grille.
 */
export async function loadSlotDetail(
  tx: Tx,
  {
    date,
    classId,
    studentId,
    classIds,
    periodLabel,
    col,
  }: {
    date: string;
    classId?: string | null;
    studentId?: string | null;
    classIds?: string[] | null;
    periodLabel: string;
    col: BoardCol;
  },
): Promise<SlotDetailRow[]> {
  if (col === 'appelsNonFaits') return [];
  const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });
  const dateObj = parseDateUTC(date);
  const dow = dowOf(date);

  const sessions = await tx.attendanceSession.findMany({
    where: {
      date: dateObj,
      periodLabel,
      ...(classId ? { classId } : classIds ? { classId: { in: classIds } } : {}),
    },
    select: {
      classId: true,
      class: { select: { name: true, nameAr: true } },
      records: {
        ...(studentId ? { where: { studentId } } : {}),
        select: {
          id: true,
          studentId: true,
          status: true,
          infirmary: true,
          punishment: true,
          exclusion: true,
          note: true,
          lateReasonId: true,
          lateReason: { select: { label: true } },
          justification: { select: { status: true } },
          student: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });

  // Matière + enseignant de la séance, dérivés de l'EDT (classId × jour × créneau).
  const subjTeacher = new Map<string, { subject: string | null; teacher: string | null }>();
  if (year) {
    const entries = await tx.timetableEntry.findMany({
      where: {
        academicYearId: year.id,
        dayOfWeek: dow,
        classId: { in: [...new Set(sessions.map((s) => s.classId))] },
        slot: { startTime: periodLabel.split('-')[0], endTime: periodLabel.split('-')[1] },
      },
      select: {
        classId: true,
        subject: { select: { label: true, labelAr: true } },
        teacher: { select: { firstName: true, lastName: true } },
      },
    });
    for (const e of entries) {
      subjTeacher.set(e.classId, {
        subject: e.subject?.label ?? null,
        teacher: e.teacher ? `${e.teacher.firstName} ${e.teacher.lastName}` : null,
      });
    }
  }

  const out: SlotDetailRow[] = [];
  for (const s of sessions) {
    const st = subjTeacher.get(s.classId);
    for (const r of s.records) {
      if (!matchesCol(r, col)) continue;
      const justifStatus = (r.justification?.status as SlotDetailRow['justifStatus']) ?? null;
      out.push({
        recordId: r.id,
        studentId: r.studentId,
        name: `${r.student.lastName} ${r.student.firstName}`,
        className: s.class.name,
        category: categoryOf(r),
        reasonId: r.lateReasonId ?? null,
        reasonLabel: r.lateReason?.label ?? null,
        note: r.note ?? null,
        subject: st?.subject ?? null,
        teacher: st?.teacher ?? null,
        justifStatus,
        isRA: justifStatus === 'APPROVED',
      });
    }
  }
  out.sort((a, b) => a.className.localeCompare(b.className) || a.name.localeCompare(b.name));
  return out;
}

export type MissingAppelRow = {
  entryId: string;
  classId: string;
  className: string;
  subject: string | null;
  teacherPersonId: string | null;
  teacherName: string | null;
  teacherUserId: string | null;
  /** Le prof a un compte utilisateur → notifiable. */
  canNotify: boolean;
};

/**
 * Profs dont l'appel n'est pas fait pour (créneau × jour) : cours attendus à
 * l'EDT sans AttendanceSession finalisée. Alimente le panneau « Appels non
 * faits » avec le bouton de notification.
 */
export async function loadMissingAppels(
  tx: Tx,
  {
    date,
    classId,
    studentId,
    classIds,
    periodLabel,
  }: {
    date: string;
    classId?: string | null;
    studentId?: string | null;
    classIds?: string[] | null;
    periodLabel: string;
  },
): Promise<MissingAppelRow[]> {
  const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });
  if (!year) return [];
  const dow = dowOf(date);
  const dateObj = parseDateUTC(date);
  const [startTime, endTime] = periodLabel.split('-');

  let scopeClassIds: string[] | null = null;
  if (studentId) {
    const scs = await tx.studentClass.findMany({
      where: { studentId, unenrolledAt: null },
      select: { classId: true },
    });
    scopeClassIds = scs.map((s) => s.classId);
  } else if (classId) {
    scopeClassIds = [classId];
  } else if (classIds) {
    scopeClassIds = classIds;
  }

  const entries = await tx.timetableEntry.findMany({
    where: {
      academicYearId: year.id,
      dayOfWeek: dow,
      slot: { startTime, endTime },
      ...(scopeClassIds ? { classId: { in: scopeClassIds } } : {}),
    },
    select: {
      id: true,
      classId: true,
      class: { select: { name: true, nameAr: true } },
      subject: { select: { label: true, labelAr: true } },
      teacherId: true,
      teacher: { select: { firstName: true, lastName: true } },
    },
  });
  if (entries.length === 0) return [];

  const finalized = await tx.attendanceSession.findMany({
    where: {
      date: dateObj,
      periodLabel,
      finalizedAt: { not: null },
      classId: { in: entries.map((e) => e.classId) },
    },
    select: { classId: true },
  });
  const done = new Set(finalized.map((f) => f.classId));
  const missing = entries.filter((e) => !done.has(e.classId));

  const teacherIds = [...new Set(missing.map((m) => m.teacherId).filter(Boolean))] as string[];
  const links =
    teacherIds.length > 0
      ? await tx.userPerson.findMany({
          where: { personId: { in: teacherIds } },
          select: { personId: true, userId: true },
        })
      : [];
  const userByPerson = new Map(links.map((l) => [l.personId, l.userId]));

  const rows = missing.map((e) => ({
    entryId: e.id,
    classId: e.classId,
    className: e.class.name,
    subject: e.subject?.label ?? null,
    teacherPersonId: e.teacherId ?? null,
    teacherName: e.teacher ? `${e.teacher.lastName} ${e.teacher.firstName}` : null,
    teacherUserId: e.teacherId ? (userByPerson.get(e.teacherId) ?? null) : null,
    canNotify: e.teacherId ? userByPerson.has(e.teacherId) : false,
  }));
  rows.sort((a, b) => (a.className.localeCompare(b.className)));
  return rows;
}

/**
 * Date (YYYY-MM-DD) de la session d'appel la plus récente (≤ aujourd'hui), pour
 * ouvrir le tableau sur une journée qui a des données plutôt qu'un jour vide.
 */
export async function latestAppelDate(tx: Tx): Promise<string | null> {
  const today = parseDateUTC(new Date().toISOString().slice(0, 10));
  // Dans l'année active seulement : ouvrir le tableau sur un appel de
  // l'exercice précédent afficherait des chiffres d'une autre année.
  const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });
  const last = await tx.attendanceSession.findFirst({
    where: { date: { lte: today }, ...(year ? { class: { academicYearId: year.id } } : {}) },
    orderBy: { date: 'desc' },
    select: { date: true },
  });
  return last ? last.date.toISOString().slice(0, 10) : null;
}

/** Élèves inscrits (année active) pour l'autocomplétion de recherche. */
export async function listEnrolledStudents(
  tx: Tx,
): Promise<{ id: string; name: string; className: string | null }[]> {
  const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });
  if (!year) return [];
  const scs = await tx.studentClass.findMany({
    where: { unenrolledAt: null, class: { academicYearId: year.id } },
    select: {
      student: { select: { id: true, firstName: true, lastName: true } },
      class: { select: { name: true, nameAr: true } },
    },
    orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
  });
  const seen = new Map<string, { id: string; name: string; className: string | null }>();
  for (const sc of scs) {
    if (seen.has(sc.student.id)) continue;
    seen.set(sc.student.id, {
      id: sc.student.id,
      name: `${sc.student.lastName} ${sc.student.firstName}`,
      className: sc.class.name,
    });
  }
  return [...seen.values()];
}
