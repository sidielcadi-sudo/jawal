import 'server-only';
import type { Prisma } from '@/lib/db';
import { dowOf, toDateStr, addDays } from '@/lib/lesson-book';

type Tx = Prisma.TransactionClient;

const GRACE_MIN = 10;
const SUCCESS_THRESHOLD = 10; // ≥ 10/20 = réussite
const DIFFICULTY_THRESHOLD = 8; // < 8/20 = en difficulté
const hhmmToMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
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

export type TeacherRow = {
  id: string;
  name: string;
  // Pédagogie
  avg: number | null; // /20, période sélectionnée
  avgPrev: number | null; // /20, période précédente
  progressionPct: number | null; // (avg - avgPrev)/avgPrev × 100
  levelAvg: number | null; // moyenne du niveau (mêmes matières)
  successPct: number | null; // % élèves ≥ 10
  difficultyPct: number | null; // % élèves < 8
  // Présence & appels
  expected: number;
  notDone: number;
  presencePct: number | null; // séances assurées / attendues
  notDonePct: number | null; // appels non faits / attendues
  // Pointage (heure d'arrivée du prof)
  absentPct: number | null; // absences injustifiées / jours pointés
  latePct: number | null; // retards / jours pointés
  // Charge horaire
  contractualHours: number | null;
  assignedHours: number;
  overtime: number; // max(0, réalisé - prévu)
  classCount: number;
};

export type TeacherKpis = {
  teacherCount: number;
  rows: TeacherRow[];
  // Agrégats présence/appels
  presencePct: number | null;
  absentPct: number | null;
  latePct: number | null;
  notDoneTotal: number;
  // Heures supplémentaires
  overtimeTotal: number;
  topOvertime: { name: string; overtime: number }[];
  hasPrev: boolean;
};

/** Agrège les notes d'une période → moyennes /20 par (élève×matière), par prof et par classe×matière. */
async function aggregateGrades(tx: Tx, periodId: string) {
  const grades = await tx.grade.findMany({
    where: { value: { not: null }, evaluation: { periodId } },
    select: {
      studentId: true,
      value: true,
      evaluation: {
        select: { classId: true, subjectId: true, weight: true, maxValue: true, subject: { select: { scale: true } } },
      },
    },
  });
  const agg = new Map<string, { weighted: number; weights: number; scale: number; classId: string; subjectId: string }>();
  for (const g of grades) {
    const ev = g.evaluation;
    const key = `${ev.classId}|${ev.subjectId}|${g.studentId}`;
    let a = agg.get(key);
    if (!a) {
      a = { weighted: 0, weights: 0, scale: ev.subject.scale, classId: ev.classId, subjectId: ev.subjectId };
      agg.set(key, a);
    }
    a.weighted += (g.value ?? 0) * (a.scale / ev.maxValue) * ev.weight;
    a.weights += ev.weight;
  }
  // studentSubjectAvg /20 + regroupements.
  const classSubjAvg = new Map<string, number[]>(); // classId|subjectId -> [avg]
  const csStudent: { classId: string; subjectId: string; studentId: string; avg: number }[] = [];
  for (const [key, a] of agg) {
    if (a.weights === 0) continue;
    const studentId = key.split('|')[2]!;
    const avg = (a.weighted / a.weights) * (20 / a.scale);
    const arr = classSubjAvg.get(`${a.classId}|${a.subjectId}`) ?? [];
    arr.push(avg);
    classSubjAvg.set(`${a.classId}|${a.subjectId}`, arr);
    csStudent.push({ classId: a.classId, subjectId: a.subjectId, studentId, avg });
  }
  return { classSubjAvg, csStudent };
}

/**
 * KPI détaillés par enseignant pour le bloc RH du tableau de bord Admin, sur une
 * période. À appeler dans un `withTenant`.
 */
export async function computeTeacherKpis(
  tx: Tx,
  opts: { periodId: string | null; tz?: string },
): Promise<TeacherKpis> {
  const tz = opts.tz || 'Africa/Casablanca';
  const empty: TeacherKpis = {
    teacherCount: 0,
    rows: [],
    presencePct: null,
    absentPct: null,
    latePct: null,
    notDoneTotal: 0,
    overtimeTotal: 0,
    topOvertime: [],
    hasPrev: false,
  };

  const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });
  if (!year) return empty;

  const periods = await tx.period.findMany({
    where: { academicYearId: year.id },
    orderBy: { startDate: 'asc' },
    select: { id: true, startDate: true, endDate: true },
  });
  const selIdx = periods.findIndex((p) => p.id === opts.periodId);
  const period = selIdx >= 0 ? periods[selIdx]! : null;
  const prevPeriod = selIdx > 0 ? periods[selIdx - 1]! : null;

  const teachers = await tx.person.findMany({
    where: { type: 'TEACHER', deletedAt: null },
    select: { id: true, firstName: true, lastName: true, contractualHoursPerWeek: true },
  });
  const teacherName = new Map(teachers.map((t) => [t.id, `${t.lastName} ${t.firstName}`]));

  const assignments = await tx.teacherAssignment.findMany({
    where: { academicYearId: year.id },
    select: { teacherId: true, classId: true, subjectId: true, hoursPerWeek: true, class: { select: { levelId: true } } },
  });
  const teacherBySlot = new Map<string, string>(); // classId|subjectId -> teacherId
  const classLevel = new Map<string, string | null>();
  for (const a of assignments) {
    teacherBySlot.set(`${a.classId}|${a.subjectId}`, a.teacherId);
    classLevel.set(a.classId, a.class.levelId ?? null);
  }

  // ── Pédagogie : moyennes courante + précédente, réussite, difficulté ─────
  const perTeacherStudent = new Map<string, Map<string, number[]>>(); // teacherId -> studentId -> [avg matière]
  const levelSubjAvg = new Map<string, number[]>(); // levelId|subjectId -> [classSubjAvg]
  let classSubjAvgCur = new Map<string, number[]>();
  if (opts.periodId) {
    const cur = await aggregateGrades(tx, opts.periodId);
    classSubjAvgCur = cur.classSubjAvg;
    for (const r of cur.csStudent) {
      const teacherId = teacherBySlot.get(`${r.classId}|${r.subjectId}`);
      if (!teacherId) continue;
      let m = perTeacherStudent.get(teacherId);
      if (!m) {
        m = new Map();
        perTeacherStudent.set(teacherId, m);
      }
      const arr = m.get(r.studentId) ?? [];
      arr.push(r.avg);
      m.set(r.studentId, arr);
    }
    // Moyenne niveau×matière (toutes classes du niveau).
    for (const [key, vals] of cur.classSubjAvg) {
      const [classId, subjectId] = key.split('|');
      const lvl = classLevel.get(classId!) ?? null;
      if (!lvl) continue;
      const lk = `${lvl}|${subjectId}`;
      const arr = levelSubjAvg.get(lk) ?? [];
      arr.push(...vals);
      levelSubjAvg.set(lk, arr);
    }
  }
  // Moyenne précédente par prof (mean des moyennes élève).
  const prevAvgByTeacher = new Map<string, number>();
  if (prevPeriod) {
    const prev = await aggregateGrades(tx, prevPeriod.id);
    const tmp = new Map<string, Map<string, number[]>>();
    for (const r of prev.csStudent) {
      const teacherId = teacherBySlot.get(`${r.classId}|${r.subjectId}`);
      if (!teacherId) continue;
      let m = tmp.get(teacherId);
      if (!m) {
        m = new Map();
        tmp.set(teacherId, m);
      }
      const arr = m.get(r.studentId) ?? [];
      arr.push(r.avg);
      m.set(r.studentId, arr);
    }
    for (const [tid, students] of tmp) {
      const studentAvgs = [...students.values()].map((a) => a.reduce((s, v) => s + v, 0) / a.length);
      if (studentAvgs.length) prevAvgByTeacher.set(tid, studentAvgs.reduce((s, v) => s + v, 0) / studentAvgs.length);
    }
  }

  // ── Présence / appels par prof (occurrences EDT vs sessions finalisées) ──
  const expectedByTeacher = new Map<string, { classId: string; periodLabel: string; dateStr: string }[]>();
  let finByKey = new Map<string, Date>();
  if (period) {
    const entries = await tx.timetableEntry.findMany({
      where: { academicYearId: year.id, slot: { isBreak: false }, teacherId: { not: null } },
      select: { teacherId: true, classId: true, dayOfWeek: true, slot: { select: { startTime: true, endTime: true } } },
    });
    const todayStr = toDateStr(new Date());
    const startStr = toDateStr(period.startDate);
    let endStr = toDateStr(period.endDate);
    if (endStr > todayStr) endStr = todayStr;
    for (let d = startStr; d <= endStr; d = addDays(d, 1)) {
      const dow = dowOf(d);
      for (const e of entries) {
        if (e.dayOfWeek !== dow || !e.teacherId) continue;
        const arr = expectedByTeacher.get(e.teacherId) ?? [];
        arr.push({ classId: e.classId, periodLabel: `${e.slot.startTime}-${e.slot.endTime}`, dateStr: d });
        expectedByTeacher.set(e.teacherId, arr);
      }
    }
    const sessions = await tx.attendanceSession.findMany({
      where: { finalizedAt: { not: null }, date: { gte: period.startDate, lte: period.endDate } },
      select: { classId: true, date: true, periodLabel: true, finalizedAt: true },
    });
    finByKey = new Map(sessions.map((s) => [`${s.classId}|${toDateStr(s.date)}|${s.periodLabel ?? ''}`, s.finalizedAt!]));
  }

  // ── Pointage enseignants (absences injustifiées + retards) par prof ──────
  const staffByTeacher = new Map<string, { total: number; absent: number; late: number }>();
  if (period) {
    const sa = await tx.staffAttendance.findMany({
      where: { person: { type: 'TEACHER' }, date: { gte: period.startDate, lte: period.endDate } },
      select: { personId: true, status: true },
    });
    for (const r of sa) {
      const s = staffByTeacher.get(r.personId) ?? { total: 0, absent: 0, late: 0 };
      s.total++;
      if (r.status === 'ABSENT') s.absent++;
      if (r.status === 'LATE') s.late++;
      staffByTeacher.set(r.personId, s);
    }
  }

  // ── Charge horaire par prof ──────────────────────────────────────────────
  const hoursByTeacher = new Map<string, number>();
  const classesByTeacher = new Map<string, Set<string>>();
  for (const a of assignments) {
    hoursByTeacher.set(a.teacherId, (hoursByTeacher.get(a.teacherId) ?? 0) + (a.hoursPerWeek ?? 0));
    const set = classesByTeacher.get(a.teacherId) ?? new Set();
    set.add(a.classId);
    classesByTeacher.set(a.teacherId, set);
  }

  // ── Assemblage des lignes ────────────────────────────────────────────────
  const rows: TeacherRow[] = teachers.map((t) => {
    const students = perTeacherStudent.get(t.id);
    const studentAvgs = students
      ? [...students.values()].map((a) => a.reduce((s, v) => s + v, 0) / a.length)
      : [];
    const avg = studentAvgs.length ? studentAvgs.reduce((s, v) => s + v, 0) / studentAvgs.length : null;
    const avgPrev = prevAvgByTeacher.get(t.id) ?? null;
    const progressionPct = avg !== null && avgPrev !== null && avgPrev !== 0 ? ((avg - avgPrev) / avgPrev) * 100 : null;
    const successPct = studentAvgs.length
      ? (studentAvgs.filter((v) => v >= SUCCESS_THRESHOLD).length / studentAvgs.length) * 100
      : null;
    const difficultyPct = studentAvgs.length
      ? (studentAvgs.filter((v) => v < DIFFICULTY_THRESHOLD).length / studentAvgs.length) * 100
      : null;

    // Moyenne du niveau (mêmes niveaux × matières que le prof).
    const tAssigns = assignments.filter((a) => a.teacherId === t.id);
    const levels = new Set(tAssigns.map((a) => a.class.levelId).filter(Boolean) as string[]);
    const subjects = new Set(tAssigns.map((a) => a.subjectId));
    const levelVals: number[] = [];
    for (const lvl of levels) for (const sub of subjects) levelVals.push(...(levelSubjAvg.get(`${lvl}|${sub}`) ?? []));
    const levelAvg = levelVals.length ? levelVals.reduce((s, v) => s + v, 0) / levelVals.length : null;

    const exp = expectedByTeacher.get(t.id) ?? [];
    let notDone = 0;
    for (const e of exp) if (!finByKey.has(`${e.classId}|${e.dateStr}|${e.periodLabel}`)) notDone++;
    const presencePct = exp.length ? ((exp.length - notDone) / exp.length) * 100 : null;
    const notDonePct = exp.length ? (notDone / exp.length) * 100 : null;

    const sa = staffByTeacher.get(t.id);
    const absentPct = sa && sa.total > 0 ? (sa.absent / sa.total) * 100 : null;
    const latePct = sa && sa.total > 0 ? (sa.late / sa.total) * 100 : null;

    const assignedHours = hoursByTeacher.get(t.id) ?? 0;
    const contractualHours = t.contractualHoursPerWeek ?? null;
    const overtime = contractualHours ? Math.max(0, assignedHours - contractualHours) : 0;
    const classCount = classesByTeacher.get(t.id)?.size ?? 0;

    return {
      id: t.id,
      name: teacherName.get(t.id) ?? t.id,
      avg,
      avgPrev,
      progressionPct,
      levelAvg,
      successPct,
      difficultyPct,
      expected: exp.length,
      notDone,
      presencePct,
      notDonePct,
      absentPct,
      latePct,
      contractualHours,
      assignedHours,
      overtime,
      classCount,
    };
  });

  // Agrégats globaux.
  const totalExpected = rows.reduce((s, r) => s + r.expected, 0);
  const totalNotDone = rows.reduce((s, r) => s + r.notDone, 0);
  const presencePct = totalExpected ? ((totalExpected - totalNotDone) / totalExpected) * 100 : null;
  const staffTotals = [...staffByTeacher.values()].reduce(
    (acc, s) => ({ total: acc.total + s.total, absent: acc.absent + s.absent, late: acc.late + s.late }),
    { total: 0, absent: 0, late: 0 },
  );
  const absentPct = staffTotals.total ? (staffTotals.absent / staffTotals.total) * 100 : null;
  const latePct = staffTotals.total ? (staffTotals.late / staffTotals.total) * 100 : null;
  const overtimeTotal = rows.reduce((s, r) => s + r.overtime, 0);
  const topOvertime = rows
    .filter((r) => r.overtime > 0)
    .sort((a, b) => b.overtime - a.overtime)
    .slice(0, 5)
    .map((r) => ({ name: r.name, overtime: r.overtime }));

  return {
    teacherCount: teachers.length,
    rows,
    presencePct,
    absentPct,
    latePct,
    notDoneTotal: totalNotDone,
    overtimeTotal,
    topOvertime,
    hasPrev: !!prevPeriod,
  };
}
