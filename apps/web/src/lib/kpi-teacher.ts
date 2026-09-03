import 'server-only';
import type { Prisma } from '@/lib/db';
import type { KpiStatus } from '@/lib/kpi-pilotage';
import { listConversationsForParticipant } from '@/lib/messaging';
import { dowOf, toDateStr, addDays } from '@/lib/lesson-book';

type Tx = Prisma.TransactionClient;

export type PeriodStat = {
  id: string;
  label: string;
  average: number | null; // /20
  belowPct: number | null; // % d'élèves < 10
  abovePct: number | null; // % d'élèves > 14
};

export type TeacherDashboard = {
  classes: string[];
  subjects: string[];
  // Évaluation & notes (matière du prof, sur la période)
  subjectAverage: number | null; // /20
  averageStatus: KpiStatus;
  distribution: { below10: number; mid: number; above14: number; total: number };
  // Progression & variation : stats de toutes les périodes + période sélectionnée
  periodStats: PeriodStat[];
  selectedPeriodId: string | null;
  // Moyenne générale par classe du prof (période sélectionnée), triée croissante
  classAverages: { className: string; average: number }[];
  // Suivi des appels (séances d'EDT du prof sur la période)
  appel: {
    expected: number;
    onTime: number;
    late: number;
    notDone: number;
    onTimePct: number | null;
    reminders: number;
  };
  // Congés / absences du prof lui-même (demandes chevauchant la période)
  leave: {
    /** Jours décomptés sur les demandes approuvées. */
    daysApproved: number;
    /** Nombre de demandes déposées, tous statuts hors annulation. */
    requests: number;
    /** Demandes encore en attente de décision. */
    pending: number;
  };
  // Présence & discipline (classes du prof, sur la période)
  attendanceRate: number | null; // %
  attendanceStatus: KpiStatus;
  absenceCount: number;
  lateCount: number;
  incidentCount: number | null; // N/A (pas de modèle discipline)
  // Charge horaire & planning (année active)
  weeklyHours: number; // h
  contractualHours: number | null;
  quotaPct: number | null; // % du quota utilisé
  quotaStatus: KpiStatus;
  // Communication & feedback
  feedback: number | null; // N/A (pas d'enquête)
  unreadMessages: number | null; // null si le prof n'a pas de compte
  // Progression du programme — N/A (pas de modèle chapitres)
  programProgress: number | null;
  chaptersRemaining: number | null;
};

/** Délai de grâce (min) après le début du cours avant de compter l'appel « en retard ». */
const APPEL_GRACE_MIN = 10;
const hhmmToMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Jour (YYYY-MM-DD) + minutes locales d'un instant dans le fuseau du tenant. */
function localDayMinutes(d: Date, tz: string): { dateStr: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return {
    dateStr: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

type NotesStats = {
  average: number | null;
  distribution: { below10: number; mid: number; above14: number; total: number };
  /** Moyennes /20 des élèves regroupées par classe. */
  byClass: Map<string, number[]>;
};

/**
 * Moyenne (/20) + distribution + moyennes par classe pour les matières du prof
 * sur une période. Moyenne pondérée par (élève, matière), normalisée /20.
 */
async function computeNotesStats(
  tx: Tx,
  classIds: string[],
  subjectIds: string[],
  periodId: string,
): Promise<NotesStats> {
  const empty: NotesStats = {
    average: null,
    distribution: { below10: 0, mid: 0, above14: 0, total: 0 },
    byClass: new Map(),
  };
  if (!classIds.length || !subjectIds.length) return empty;

  const grades = await tx.grade.findMany({
    where: {
      value: { not: null },
      evaluation: { periodId, classId: { in: classIds }, subjectId: { in: subjectIds } },
    },
    select: {
      studentId: true,
      value: true,
      evaluation: {
        select: {
          weight: true,
          maxValue: true,
          subjectId: true,
          classId: true,
          subject: { select: { scale: true } },
        },
      },
    },
  });

  const agg = new Map<string, { weighted: number; weights: number; scale: number; classId: string }>();
  for (const g of grades) {
    const key = `${g.studentId}:${g.evaluation.subjectId}`;
    let a = agg.get(key);
    if (!a) {
      a = { weighted: 0, weights: 0, scale: g.evaluation.subject.scale, classId: g.evaluation.classId };
      agg.set(key, a);
    }
    const norm = (g.value ?? 0) * (a.scale / g.evaluation.maxValue);
    a.weighted += norm * g.evaluation.weight;
    a.weights += g.evaluation.weight;
  }

  const studentAverages: number[] = [];
  const byClass = new Map<string, number[]>();
  for (const [, a] of agg) {
    if (a.weights === 0) continue;
    const v = (a.weighted / a.weights) * (20 / a.scale);
    studentAverages.push(v);
    const arr = byClass.get(a.classId) ?? [];
    arr.push(v);
    byClass.set(a.classId, arr);
  }
  if (studentAverages.length === 0) return empty;

  const distribution = { below10: 0, mid: 0, above14: 0, total: studentAverages.length };
  for (const v of studentAverages) {
    if (v < 10) distribution.below10++;
    else if (v < 14) distribution.mid++;
    else distribution.above14++;
  }
  const average = studentAverages.reduce((s, v) => s + v, 0) / studentAverages.length;
  return { average, distribution, byClass };
}

export type ClassProgression = {
  periods: { id: string; label: string }[];
  rows: { studentId: string; name: string; byPeriod: (number | null)[] }[];
};

/**
 * Moyenne /20 par élève et par période (trimestre/semestre) pour les matières
 * que le prof enseigne dans une classe. Alimente le tableau « Progression
 * trimestrielle des élèves ». À appeler dans un `withTenant`.
 */
export async function computeClassProgression(
  tx: Tx,
  teacherId: string,
  classId: string,
): Promise<ClassProgression> {
  const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });
  if (!year) return { periods: [], rows: [] };

  const periods = await tx.period.findMany({
    where: { academicYearId: year.id },
    orderBy: { startDate: 'asc' },
    select: { id: true, label: true, labelAr: true },
  });
  const assigns = await tx.teacherAssignment.findMany({
    where: { teacherId, classId, academicYearId: year.id },
    select: { subjectId: true },
  });
  const subjectIds = [...new Set(assigns.map((a) => a.subjectId))];
  const scs = await tx.studentClass.findMany({
    where: { classId, unenrolledAt: null },
    select: { student: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { student: { lastName: 'asc' } },
  });
  const students = scs.map((s) => s.student);
  if (periods.length === 0 || subjectIds.length === 0 || students.length === 0) {
    return { periods: periods.map((p) => ({ id: p.id, label: p.label, labelAr: p.labelAr })), rows: [] };
  }

  const grades = await tx.grade.findMany({
    where: {
      value: { not: null },
      studentId: { in: students.map((s) => s.id) },
      evaluation: { classId, subjectId: { in: subjectIds }, periodId: { in: periods.map((p) => p.id) } },
    },
    select: {
      studentId: true,
      value: true,
      evaluation: {
        select: { periodId: true, subjectId: true, weight: true, maxValue: true, subject: { select: { scale: true } } },
      },
    },
  });

  // Agrégat pondéré par (élève, période, matière).
  const agg = new Map<string, { weighted: number; weights: number; scale: number }>();
  for (const g of grades) {
    const ev = g.evaluation;
    const key = `${g.studentId}|${ev.periodId}|${ev.subjectId}`;
    let a = agg.get(key);
    if (!a) {
      a = { weighted: 0, weights: 0, scale: ev.subject.scale };
      agg.set(key, a);
    }
    a.weighted += (g.value ?? 0) * (a.scale / ev.maxValue) * ev.weight;
    a.weights += ev.weight;
  }
  // Moyenne par (élève, période) = moyenne des moyennes/matière.
  const subjAvgs = new Map<string, number[]>(); // `${studentId}|${periodId}` -> [avg matière]
  for (const [key, a] of agg) {
    if (a.weights === 0) continue;
    const [sid, pid] = key.split('|');
    const v = (a.weighted / a.weights) * (20 / a.scale);
    const k = `${sid}|${pid}`;
    const arr = subjAvgs.get(k) ?? [];
    arr.push(v);
    subjAvgs.set(k, arr);
  }

  const rows = students.map((st) => ({
    studentId: st.id,
    name: `${st.lastName} ${st.firstName}`,
    byPeriod: periods.map((p) => {
      const arr = subjAvgs.get(`${st.id}|${p.id}`);
      return arr && arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
    }),
  }));

  return { periods: periods.map((p) => ({ id: p.id, label: p.label, labelAr: p.labelAr })), rows };
}

const statusAverage = (v: number | null): KpiStatus =>
  v === null ? 'na' : v > 12 ? 'green' : v >= 10 ? 'orange' : 'red';
const statusAttendance = (v: number | null): KpiStatus =>
  v === null ? 'na' : v >= 95 ? 'green' : v >= 90 ? 'orange' : 'red';
const statusQuota = (v: number | null): KpiStatus =>
  v === null ? 'na' : v < 80 ? 'green' : v <= 100 ? 'orange' : 'red';

/**
 * Tableau de bord d'un enseignant pour une période donnée.
 * Les indicateurs sans source de données (programme, incidents, feedback)
 * sont renvoyés à null → affichés « N/A ». À appeler dans un `withTenant`.
 */
export async function computeTeacherDashboard(
  tx: Tx,
  opts: { teacherId: string; periodId: string | null; tz?: string },
): Promise<TeacherDashboard> {
  const tz = opts.tz || 'Africa/Casablanca';
  const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });

  const assignments = year
    ? await tx.teacherAssignment.findMany({
        where: { teacherId: opts.teacherId, academicYearId: year.id },
        select: {
          hoursPerWeek: true,
          subjectId: true,
          classId: true,
          subject: { select: { label: true, labelAr: true } },
          class: { select: { name: true, nameAr: true, levelId: true } },
        },
      })
    : [];

  const classIds = [...new Set(assignments.map((a) => a.classId))];
  const subjectIds = [...new Set(assignments.map((a) => a.subjectId))];
  const classNames = [...new Set(assignments.map((a) => a.class.name))];
  const subjectNames = [...new Set(assignments.map((a) => a.subject.label))];

  // ── Charge horaire (fallback curriculum) ─────────────────────────────────
  const levelIds = [...new Set(assignments.map((a) => a.class.levelId))];
  const curriculum = levelIds.length
    ? await tx.curriculumSubject.findMany({
        where: { levelId: { in: levelIds } },
        select: { levelId: true, subjectId: true, weeklyHours: true },
      })
    : [];
  const curByKey = new Map(curriculum.map((c) => [`${c.levelId}|${c.subjectId}`, c.weeklyHours]));
  const weeklyHours = assignments.reduce(
    (s, a) => s + (a.hoursPerWeek ?? curByKey.get(`${a.class.levelId}|${a.subjectId}`) ?? 0),
    0,
  );
  const teacher = await tx.person.findUnique({
    where: { id: opts.teacherId },
    select: { contractualHoursPerWeek: true },
  });
  const contractualHours = teacher?.contractualHoursPerWeek ?? null;
  const quotaPct = contractualHours && contractualHours > 0 ? (weeklyHours / contractualHours) * 100 : null;

  // ── Notes : moyenne + distribution (matière(s) du prof), par période ─────
  const periodList = year
    ? await tx.period.findMany({
        where: { academicYearId: year.id },
        orderBy: { startDate: 'asc' },
        select: { id: true, label: true, labelAr: true },
      })
    : [];

  const statsByPeriod = new Map<string, NotesStats>();
  for (const p of periodList) {
    statsByPeriod.set(p.id, await computeNotesStats(tx, classIds, subjectIds, p.id));
  }

  const periodStats: PeriodStat[] = periodList.map((p) => {
    const s = statsByPeriod.get(p.id)!;
    const total = s.distribution.total;
    return {
      id: p.id,
      label: p.label,
      average: s.average,
      belowPct: total > 0 ? (s.distribution.below10 / total) * 100 : null,
      abovePct: total > 0 ? (s.distribution.above14 / total) * 100 : null,
    };
  });

  const selected = opts.periodId ? statsByPeriod.get(opts.periodId) : undefined;
  const subjectAverage = selected?.average ?? null;
  const distribution = selected?.distribution ?? { below10: 0, mid: 0, above14: 0, total: 0 };

  // Moyenne générale par classe (période sélectionnée), triée croissante.
  const classNameById = new Map(assignments.map((a) => [a.classId, a.class.name]));
  const classAverages = selected
    ? [...selected.byClass.entries()]
        .map(([cid, vals]) => ({
          className: classNameById.get(cid) ?? cid,
          average: vals.reduce((s, v) => s + v, 0) / vals.length,
        }))
        .sort((a, b) => a.average - b.average)
    : [];

  // ── Présence + retards (sessions finalisées des classes du prof) ─────────
  let attendanceRate: number | null = null;
  let absenceCount = 0;
  let lateCount = 0;
  if (opts.periodId && classIds.length) {
    const period = await tx.period.findUnique({
      where: { id: opts.periodId },
      select: { startDate: true, endDate: true },
    });
    if (period) {
      const records = await tx.attendanceRecord.findMany({
        where: {
          session: {
            classId: { in: classIds },
            finalizedAt: { not: null },
            date: { gte: period.startDate, lte: period.endDate },
          },
        },
        select: { status: true },
      });
      const total = records.length;
      if (total > 0) {
        const present = records.filter(
          (r) => r.status === 'PRESENT' || r.status === 'LATE' || r.status === 'EXCUSED',
        ).length;
        attendanceRate = (present / total) * 100;
      }
      absenceCount = records.filter((r) => r.status === 'ABSENT').length;
      lateCount = records.filter((r) => r.status === 'LATE').length;
    }
  }

  // ── Congés / absences du prof (demandes chevauchant la période) ─────────
  // Une demande à cheval sur deux trimestres compte dans les deux : le prof
  // était bien absent dans chacun, et un décompte au prorata donnerait des
  // demi-journées difficiles à rapprocher du dossier RH.
  const leave = { daysApproved: 0, requests: 0, pending: 0 };
  if (opts.periodId) {
    const period = await tx.period.findUnique({
      where: { id: opts.periodId },
      select: { startDate: true, endDate: true },
    });
    if (period) {
      const requests = await tx.leaveRequest.findMany({
        where: {
          personId: opts.teacherId,
          status: { not: 'CANCELLED' },
          startDate: { lte: period.endDate },
          endDate: { gte: period.startDate },
        },
        select: { days: true, status: true },
      });
      leave.requests = requests.length;
      leave.pending = requests.filter((r) => r.status === 'PENDING').length;
      leave.daysApproved = requests
        .filter((r) => r.status === 'APPROVED')
        .reduce((s, r) => s + r.days, 0);
    }
  }

  // ── Suivi des appels (séances d'EDT du prof sur la période) ──────────────
  const appel = { expected: 0, onTime: 0, late: 0, notDone: 0, onTimePct: null as number | null, reminders: 0 };
  if (opts.periodId && year) {
    const period = await tx.period.findUnique({
      where: { id: opts.periodId },
      select: { startDate: true, endDate: true },
    });
    const entries = await tx.timetableEntry.findMany({
      where: { teacherId: opts.teacherId, academicYearId: year.id, slot: { isBreak: false } },
      select: { id: true, classId: true, dayOfWeek: true, slot: { select: { startTime: true, endTime: true } } },
    });
    if (period && entries.length) {
      // Bornes en chaînes de date (la fenêtre n'inclut pas le futur).
      const todayStr = toDateStr(new Date());
      const startStr = toDateStr(period.startDate);
      let endStr = toDateStr(period.endDate);
      if (endStr > todayStr) endStr = todayStr;

      // Séances attendues = occurrences de chaque case d'EDT dans la fenêtre.
      type Exp = { entryId: string; classId: string; periodLabel: string; startMin: number; dateStr: string };
      const expected: Exp[] = [];
      for (let d = startStr; d <= endStr; d = addDays(d, 1)) {
        const dow = dowOf(d);
        for (const e of entries) {
          if (e.dayOfWeek !== dow) continue;
          expected.push({
            entryId: e.id,
            classId: e.classId,
            periodLabel: `${e.slot.startTime}-${e.slot.endTime}`,
            startMin: hhmmToMin(e.slot.startTime),
            dateStr: d,
          });
        }
      }
      appel.expected = expected.length;

      if (expected.length) {
        const classIdsEdt = [...new Set(expected.map((e) => e.classId))];
        const sessions = await tx.attendanceSession.findMany({
          where: {
            classId: { in: classIdsEdt },
            finalizedAt: { not: null },
            date: { gte: period.startDate, lte: period.endDate },
          },
          select: { classId: true, date: true, periodLabel: true, finalizedAt: true },
        });
        const finByKey = new Map<string, Date>();
        for (const s of sessions) {
          finByKey.set(`${s.classId}|${toDateStr(s.date)}|${s.periodLabel ?? ''}`, s.finalizedAt!);
        }
        for (const e of expected) {
          const fin = finByKey.get(`${e.classId}|${e.dateStr}|${e.periodLabel}`);
          if (!fin) {
            appel.notDone++;
            continue;
          }
          // Heure locale (tenant) de finalisation comparée au début + grâce.
          const loc = localDayMinutes(fin, tz);
          const onTime = loc.dateStr === e.dateStr && loc.minutes <= e.startMin + APPEL_GRACE_MIN;
          if (onTime) appel.onTime++;
          else appel.late++;
        }
        appel.onTimePct = appel.expected > 0 ? (appel.onTime / appel.expected) * 100 : null;
      }

      appel.reminders = await tx.appelReminder.count({
        where: { entryId: { in: entries.map((e) => e.id) }, date: { gte: period.startDate, lte: period.endDate } },
      });
    }
  }

  // ── Messages non lus (si le prof a un compte utilisateur) ────────────────
  let unreadMessages: number | null = null;
  const link = await tx.userPerson.findFirst({
    where: { personId: opts.teacherId },
    select: { userId: true },
  });
  if (link) {
    const convos = await listConversationsForParticipant(tx, link.userId);
    unreadMessages = convos.filter((c) => c.flag).length;
  }

  return {
    classes: classNames,
    subjects: subjectNames,
    subjectAverage,
    averageStatus: statusAverage(subjectAverage),
    distribution,
    periodStats,
    selectedPeriodId: opts.periodId,
    classAverages,
    appel,
    leave,
    attendanceRate,
    attendanceStatus: statusAttendance(attendanceRate),
    absenceCount,
    lateCount,
    incidentCount: null,
    weeklyHours,
    contractualHours,
    quotaPct,
    quotaStatus: statusQuota(quotaPct),
    feedback: null,
    unreadMessages,
    programProgress: null,
    chaptersRemaining: null,
  };
}
