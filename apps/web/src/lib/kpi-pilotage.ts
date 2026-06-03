import 'server-only';
import type { Prisma } from '@/lib/db';
import { computeAcademicOverview, computeAttendanceRate } from './bi';

type Tx = Prisma.TransactionClient;

/** Statut couleur d'un KPI. `na` = pas de source de données. */
export type KpiStatus = 'green' | 'orange' | 'red' | 'na';

export type Kpi = {
  key: string;
  /** Valeur numérique brute, ou null si indisponible. */
  value: number | null;
  unit: '%' | '/20' | 'h' | '/5' | '';
  status: KpiStatus;
};

export type LevelAverage = {
  levelId: string;
  label: string;
  average: number | null;
  status: KpiStatus;
};

export type PilotageData = {
  successRate: Kpi; // 1
  absenteeism: Kpi; // 2
  collection: Kpi; // 3
  teacherLoad: Kpi; // 4
  satisfaction: Kpi; // 5 (na)
  levelAverages: LevelAverage[]; // 6
  conformiteMassar: Kpi; // 7 (na)
};

// ─── Barèmes de couleur (cf. spécification direction) ──────────────────────
function statusHigherBetter(v: number | null, green: number, orange: number): KpiStatus {
  if (v === null) return 'na';
  if (v > green) return 'green';
  if (v >= orange) return 'orange';
  return 'red';
}
function statusLowerBetter(v: number | null, green: number, orange: number): KpiStatus {
  if (v === null) return 'na';
  if (v < green) return 'green';
  if (v <= orange) return 'orange';
  return 'red';
}

const statusSuccess = (v: number | null) => statusHigherBetter(v, 80, 60); // >80 / 60-80 / <60
const statusAbsenteeism = (v: number | null) => statusLowerBetter(v, 5, 10); // <5 / 5-10 / >10
const statusCollection = (v: number | null) => statusHigherBetter(v, 90, 80); // >90 / 80-90 / <80
const statusTeacherLoad = (v: number | null) => statusLowerBetter(v, 15, 20); // <15 / 15-20 / >20
const statusLevelAverage = (v: number | null) => statusHigherBetter(v, 12, 10); // >12 / 10-12 / <10

/** Charge horaire hebdomadaire moyenne par enseignant (année active). */
async function computeTeacherLoad(tx: Tx): Promise<number | null> {
  const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });
  if (!year) return null;
  const assignments = await tx.teacherAssignment.findMany({
    where: { academicYearId: year.id },
    select: {
      teacherId: true,
      hoursPerWeek: true,
      subjectId: true,
      class: { select: { levelId: true } },
    },
  });
  if (assignments.length === 0) return null;

  // Fallback volume horaire via le programme (CurriculumSubject).
  const levelIds = [...new Set(assignments.map((a) => a.class.levelId))];
  const curriculum = await tx.curriculumSubject.findMany({
    where: { levelId: { in: levelIds } },
    select: { levelId: true, subjectId: true, weeklyHours: true },
  });
  const curByKey = new Map(curriculum.map((c) => [`${c.levelId}|${c.subjectId}`, c.weeklyHours]));

  const byTeacher = new Map<string, number>();
  for (const a of assignments) {
    const hours = a.hoursPerWeek ?? curByKey.get(`${a.class.levelId}|${a.subjectId}`) ?? 0;
    byTeacher.set(a.teacherId, (byTeacher.get(a.teacherId) ?? 0) + hours);
  }
  if (byTeacher.size === 0) return null;
  const total = [...byTeacher.values()].reduce((s, h) => s + h, 0);
  return total / byTeacher.size;
}

/** Moyenne générale (/20) par niveau pour une période. */
async function computeLevelAverages(tx: Tx, periodId: string): Promise<LevelAverage[]> {
  const grades = await tx.grade.findMany({
    where: { value: { not: null }, evaluation: { periodId } },
    select: {
      studentId: true,
      value: true,
      evaluation: {
        select: {
          weight: true,
          maxValue: true,
          classId: true,
          subjectId: true,
          class: { select: { levelId: true, level: { select: { label: true, order: true } } } },
          subject: { select: { scale: true, coefficient: true } },
        },
      },
    },
  });
  if (grades.length === 0) return [];

  // Coef programme (level × subject), fallback Subject.coefficient.
  const pairs = new Set<string>();
  for (const g of grades) pairs.add(`${g.evaluation.class.levelId}::${g.evaluation.subjectId}`);
  const cur = await tx.curriculumSubject.findMany({
    where: {
      OR: [...pairs].map((p) => {
        const [levelId, subjectId] = p.split('::');
        return { levelId: levelId!, subjectId: subjectId! };
      }),
    },
    select: { levelId: true, subjectId: true, coefficient: true },
  });
  const coefMap = new Map(cur.map((e) => [`${e.levelId}::${e.subjectId}`, e.coefficient]));

  // Agrégation par (élève, classe) → moyenne générale /20, taguée par niveau.
  type SubAgg = { weighted: number; weights: number; scale: number; coefficient: number };
  type SC = { levelId: string; label: string; order: number; subjects: Map<string, SubAgg> };
  const studentClasses = new Map<string, SC>();
  for (const g of grades) {
    const key = `${g.studentId}:${g.evaluation.classId}`;
    let sc = studentClasses.get(key);
    if (!sc) {
      sc = {
        levelId: g.evaluation.class.levelId,
        label: g.evaluation.class.level.label,
        order: g.evaluation.class.level.order,
        subjects: new Map(),
      };
      studentClasses.set(key, sc);
    }
    let sa = sc.subjects.get(g.evaluation.subjectId);
    if (!sa) {
      const coef = coefMap.get(`${g.evaluation.class.levelId}::${g.evaluation.subjectId}`);
      sa = {
        weighted: 0,
        weights: 0,
        scale: g.evaluation.subject.scale,
        coefficient: coef ?? g.evaluation.subject.coefficient,
      };
      sc.subjects.set(g.evaluation.subjectId, sa);
    }
    const norm = (g.value ?? 0) * (sa.scale / g.evaluation.maxValue);
    sa.weighted += norm * g.evaluation.weight;
    sa.weights += g.evaluation.weight;
  }

  const byLevel = new Map<string, { label: string; order: number; sum: number; count: number }>();
  for (const [, sc] of studentClasses) {
    let coefSum = 0;
    let coefWeighted = 0;
    for (const [, sa] of sc.subjects) {
      if (sa.weights === 0) continue;
      const subjectAvg = sa.weighted / sa.weights;
      const normTo20 = subjectAvg * (20 / sa.scale);
      coefWeighted += normTo20 * sa.coefficient;
      coefSum += sa.coefficient;
    }
    if (coefSum === 0) continue;
    const gen = coefWeighted / coefSum;
    let lv = byLevel.get(sc.levelId);
    if (!lv) {
      lv = { label: sc.label, order: sc.order, sum: 0, count: 0 };
      byLevel.set(sc.levelId, lv);
    }
    lv.sum += gen;
    lv.count++;
  }

  return [...byLevel.entries()]
    .map(([levelId, v]) => {
      const average = v.count > 0 ? v.sum / v.count : null;
      return { levelId, label: v.label, average, status: statusLevelAverage(average), order: v.order };
    })
    .sort((a, b) => a.order - b.order)
    .map(({ order: _order, ...rest }) => rest);
}

/**
 * Cockpit de pilotage : 7 KPI direction avec statut couleur.
 * Satisfaction et conformité Massar sont `na` (aucune source de données).
 * À appeler dans un `withTenant`.
 */
export async function computePilotage(tx: Tx, periodId: string | null): Promise<PilotageData> {
  const [academic, attendance, teacherLoad, levelAverages, installments, payments] = await Promise.all([
    periodId ? computeAcademicOverview(tx, periodId) : Promise.resolve(null),
    periodId ? computeAttendanceRate(tx, periodId) : Promise.resolve(null),
    computeTeacherLoad(tx),
    periodId ? computeLevelAverages(tx, periodId) : Promise.resolve([] as LevelAverage[]),
    tx.installment.findMany({ where: { status: { not: 'CANCELLED' } }, select: { amount: true } }),
    tx.payment.findMany({ select: { amount: true } }),
  ]);

  const successRate = academic?.successRate ?? null;

  const absenteeism =
    attendance && attendance.totalRecords > 0
      ? (attendance.absentCount / attendance.totalRecords) * 100
      : null;

  const totalDue = installments.reduce((s, i) => s + Number(i.amount), 0);
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
  const collection = totalDue > 0 ? (totalPaid / totalDue) * 100 : null;

  return {
    successRate: { key: 'successRate', value: successRate, unit: '%', status: statusSuccess(successRate) },
    absenteeism: { key: 'absenteeism', value: absenteeism, unit: '%', status: statusAbsenteeism(absenteeism) },
    collection: { key: 'collection', value: collection, unit: '%', status: statusCollection(collection) },
    teacherLoad: { key: 'teacherLoad', value: teacherLoad, unit: 'h', status: statusTeacherLoad(teacherLoad) },
    satisfaction: { key: 'satisfaction', value: null, unit: '/5', status: 'na' },
    levelAverages,
    conformiteMassar: { key: 'conformiteMassar', value: null, unit: '%', status: 'na' },
  };
}
