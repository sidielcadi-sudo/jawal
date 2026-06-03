import 'server-only';
import type { Prisma } from '@/lib/db';
import type { KpiStatus } from '@/lib/kpi-pilotage';
import { listConversationsForParticipant } from '@/lib/messaging';

type Tx = Prisma.TransactionClient;

export type TeacherDashboard = {
  classes: string[];
  subjects: string[];
  // Évaluation & notes (matière du prof, sur la période)
  subjectAverage: number | null; // /20
  averageStatus: KpiStatus;
  distribution: { below10: number; mid: number; above14: number; total: number };
  // Présence & discipline (classes du prof, sur la période)
  attendanceRate: number | null; // %
  attendanceStatus: KpiStatus;
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
  opts: { teacherId: string; periodId: string | null },
): Promise<TeacherDashboard> {
  const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });

  const assignments = year
    ? await tx.teacherAssignment.findMany({
        where: { teacherId: opts.teacherId, academicYearId: year.id },
        select: {
          hoursPerWeek: true,
          subjectId: true,
          classId: true,
          subject: { select: { label: true } },
          class: { select: { name: true, levelId: true } },
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

  // ── Notes : moyenne + distribution (matière(s) du prof, sur la période) ──
  let subjectAverage: number | null = null;
  let distribution = { below10: 0, mid: 0, above14: 0, total: 0 };
  if (opts.periodId && classIds.length && subjectIds.length) {
    const grades = await tx.grade.findMany({
      where: {
        value: { not: null },
        evaluation: {
          periodId: opts.periodId,
          classId: { in: classIds },
          subjectId: { in: subjectIds },
        },
      },
      select: {
        studentId: true,
        value: true,
        evaluation: {
          select: { weight: true, maxValue: true, subjectId: true, subject: { select: { scale: true } } },
        },
      },
    });
    // Moyenne pondérée par (élève, matière), normalisée /20.
    const agg = new Map<string, { weighted: number; weights: number; scale: number }>();
    for (const g of grades) {
      const key = `${g.studentId}:${g.evaluation.subjectId}`;
      let a = agg.get(key);
      if (!a) {
        a = { weighted: 0, weights: 0, scale: g.evaluation.subject.scale };
        agg.set(key, a);
      }
      const norm = (g.value ?? 0) * (a.scale / g.evaluation.maxValue);
      a.weighted += norm * g.evaluation.weight;
      a.weights += g.evaluation.weight;
    }
    const studentAverages: number[] = [];
    for (const [, a] of agg) {
      if (a.weights === 0) continue;
      studentAverages.push((a.weighted / a.weights) * (20 / a.scale));
    }
    if (studentAverages.length > 0) {
      subjectAverage = studentAverages.reduce((s, v) => s + v, 0) / studentAverages.length;
      for (const v of studentAverages) {
        if (v < 10) distribution.below10++;
        else if (v < 14) distribution.mid++;
        else distribution.above14++;
      }
      distribution.total = studentAverages.length;
    }
  }

  // ── Présence + retards (sessions finalisées des classes du prof) ─────────
  let attendanceRate: number | null = null;
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
      lateCount = records.filter((r) => r.status === 'LATE').length;
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
    attendanceRate,
    attendanceStatus: statusAttendance(attendanceRate),
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
