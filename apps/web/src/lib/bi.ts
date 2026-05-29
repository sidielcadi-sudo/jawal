import 'server-only';
import type { Prisma } from '@/lib/db';
import { computeMention } from './grades';

type Tx = Prisma.TransactionClient;

/**
 * Effectifs : élèves actifs, enseignants, classes actives, capacité moyenne.
 */
export async function computeHeadcount(tx: Tx): Promise<{
  students: number;
  teachers: number;
  staff: number;
  parents: number;
  classes: number;
  totalCapacity: number;
  totalEnrolled: number;
  occupancyRate: number;
}> {
  const [students, teachers, staff, parents, classes, enrollments] = await Promise.all([
    tx.person.count({ where: { type: 'STUDENT', deletedAt: null } }),
    tx.person.count({ where: { type: 'TEACHER', deletedAt: null } }),
    tx.person.count({ where: { type: 'STAFF', deletedAt: null } }),
    tx.person.count({ where: { type: 'PARENT', deletedAt: null } }),
    tx.class.findMany({ where: { deletedAt: null }, select: { id: true, capacity: true } }),
    tx.studentClass.findMany({ where: { unenrolledAt: null }, select: { classId: true } }),
  ]);

  const totalCapacity = classes.reduce((s, c) => s + c.capacity, 0);
  const enrolledByClass = new Map<string, number>();
  for (const e of enrollments) enrolledByClass.set(e.classId, (enrolledByClass.get(e.classId) ?? 0) + 1);
  const totalEnrolled = enrollments.length;
  const occupancyRate = totalCapacity > 0 ? (totalEnrolled / totalCapacity) * 100 : 0;

  return {
    students,
    teachers,
    staff,
    parents,
    classes: classes.length,
    totalCapacity,
    totalEnrolled,
    occupancyRate,
  };
}

/**
 * Synthèse académique : moyenne générale tenant + taux de réussite (>=10/20)
 * + top 5 / bottom 5 classes par moyenne sur une période.
 */
export async function computeAcademicOverview(
  tx: Tx,
  periodId: string,
): Promise<{
  studentsRated: number;
  averageGeneral: number | null;
  successRate: number | null;
  topClasses: Array<{ classId: string; name: string; average: number }>;
  bottomClasses: Array<{ classId: string; name: string; average: number }>;
}> {
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
          class: { select: { name: true } },
          subject: { select: { scale: true, coefficient: true } },
        },
      },
    },
  });

  if (grades.length === 0) {
    return { studentsRated: 0, averageGeneral: null, successRate: null, topClasses: [], bottomClasses: [] };
  }

  // Agrégation : par (studentId, subjectKey) — on simplifie en utilisant scale comme clé pour les normalisations
  // En réalité on veut par (studentId, subjectId), donc on enrichit la requête.
  // Pour rester économique, on agrège par classe directement avec moyenne /20 normalisée puis pondérée.
  // Étape 1 : moyenne par (student, classId) en /20.
  const byStudent = new Map<string, { classId: string; className: string; weightedSum: number; weightSum: number; coefSum: number; coefWeightedSum: number; subjectMap: Map<string, { sum: number; weight: number; scale: number; coefficient: number }> }>();
  for (const g of grades) {
    const studentClassKey = `${g.studentId}:${g.evaluation.classId}`;
    let entry = byStudent.get(studentClassKey);
    if (!entry) {
      entry = {
        classId: g.evaluation.classId,
        className: g.evaluation.class.name,
        weightedSum: 0,
        weightSum: 0,
        coefSum: 0,
        coefWeightedSum: 0,
        subjectMap: new Map(),
      };
      byStudent.set(studentClassKey, entry);
    }
    // On groupe par subject (via scale+coefficient comme proxy ; il faudrait subject.id, simplifions pour MVP)
    // Mieux : fetcher subject.id explicitement. Étape suivante.
  }

  // Pour faire propre, refaire avec subject.id
  const grades2 = await tx.grade.findMany({
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
          class: { select: { name: true } },
          subject: { select: { id: true, scale: true, coefficient: true } },
        },
      },
    },
  });

  // Groupes : (studentId, classId, subjectId) → liste de notes (value, weight, maxValue, scale)
  type SubjAgg = { weighted: number; weights: number; scale: number; coefficient: number };
  const studentClasses = new Map<string, { classId: string; className: string; subjects: Map<string, SubjAgg> }>();
  for (const g of grades2) {
    const key = `${g.studentId}:${g.evaluation.classId}`;
    let sc = studentClasses.get(key);
    if (!sc) {
      sc = { classId: g.evaluation.classId, className: g.evaluation.class.name, subjects: new Map() };
      studentClasses.set(key, sc);
    }
    let sa = sc.subjects.get(g.evaluation.subjectId);
    if (!sa) {
      sa = {
        weighted: 0,
        weights: 0,
        scale: g.evaluation.subject.scale,
        coefficient: g.evaluation.subject.coefficient,
      };
      sc.subjects.set(g.evaluation.subjectId, sa);
    }
    const norm = (g.value ?? 0) * (sa.scale / g.evaluation.maxValue);
    sa.weighted += norm * g.evaluation.weight;
    sa.weights += g.evaluation.weight;
  }

  // Pour chaque (studentId, classId) → moyenne générale normalisée /20
  type StudentGen = { classId: string; className: string; generalAvg: number };
  const generals: StudentGen[] = [];
  for (const [, sc] of studentClasses) {
    let coefSum = 0;
    let coefWeighted = 0;
    for (const [, sa] of sc.subjects) {
      const subjectAvg = sa.weights > 0 ? sa.weighted / sa.weights : null;
      if (subjectAvg === null) continue;
      // normaliser à /20 pour la moyenne générale
      const normTo20 = subjectAvg * (20 / sa.scale);
      coefWeighted += normTo20 * sa.coefficient;
      coefSum += sa.coefficient;
    }
    if (coefSum > 0) {
      generals.push({
        classId: sc.classId,
        className: sc.className,
        generalAvg: coefWeighted / coefSum,
      });
    }
  }

  const studentsRated = generals.length;
  const averageGeneral = studentsRated > 0
    ? generals.reduce((s, x) => s + x.generalAvg, 0) / studentsRated
    : null;
  const successRate = studentsRated > 0
    ? (generals.filter((g) => g.generalAvg >= 10).length / studentsRated) * 100
    : null;

  // Moyenne par classe (moyenne arithmétique des moyennes d'élèves)
  const byClass = new Map<string, { name: string; sum: number; count: number }>();
  for (const g of generals) {
    let c = byClass.get(g.classId);
    if (!c) {
      c = { name: g.className, sum: 0, count: 0 };
      byClass.set(g.classId, c);
    }
    c.sum += g.generalAvg;
    c.count++;
  }
  const classRanking = Array.from(byClass.entries())
    .map(([classId, v]) => ({ classId, name: v.name, average: v.sum / v.count }))
    .sort((a, b) => b.average - a.average);

  return {
    studentsRated,
    averageGeneral,
    successRate,
    topClasses: classRanking.slice(0, 5),
    bottomClasses: classRanking.slice(-5).reverse(),
  };
}

/**
 * Taux de présence moyen sur les sessions finalisées d'une période.
 */
export async function computeAttendanceRate(
  tx: Tx,
  periodId: string,
): Promise<{
  rate: number | null;
  totalRecords: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
}> {
  const period = await tx.period.findUnique({ where: { id: periodId } });
  if (!period) {
    return { rate: null, totalRecords: 0, presentCount: 0, absentCount: 0, lateCount: 0, excusedCount: 0 };
  }
  const records = await tx.attendanceRecord.findMany({
    where: {
      session: {
        finalizedAt: { not: null },
        date: { gte: period.startDate, lte: period.endDate },
      },
    },
    select: { status: true },
  });

  const total = records.length;
  if (total === 0) {
    return { rate: null, totalRecords: 0, presentCount: 0, absentCount: 0, lateCount: 0, excusedCount: 0 };
  }
  const present = records.filter((r) => r.status === 'PRESENT' || r.status === 'LATE' || r.status === 'EXCUSED').length;
  const absent = records.filter((r) => r.status === 'ABSENT').length;
  const late = records.filter((r) => r.status === 'LATE').length;
  const excused = records.filter((r) => r.status === 'EXCUSED').length;

  return {
    rate: (present / total) * 100,
    totalRecords: total,
    presentCount: present,
    absentCount: absent,
    lateCount: late,
    excusedCount: excused,
  };
}

/**
 * Élèves à risque : combinaison de critères absentéisme et performance.
 */
export async function findAtRiskStudents(
  tx: Tx,
  periodId: string,
  options: { absenceThreshold?: number; gradeThreshold?: number; limit?: number } = {},
): Promise<
  Array<{
    studentId: string;
    firstName: string;
    lastName: string;
    classId: string | null;
    className: string | null;
    absenceRate: number | null;
    averageGrade: number | null;
    reasons: string[];
  }>
> {
  const absenceThreshold = options.absenceThreshold ?? 15;
  const gradeThreshold = options.gradeThreshold ?? 10;
  const limit = options.limit ?? 10;

  const period = await tx.period.findUnique({ where: { id: periodId } });
  if (!period) return [];

  // Données présence par élève
  const attendance = await tx.attendanceRecord.findMany({
    where: {
      session: {
        finalizedAt: { not: null },
        date: { gte: period.startDate, lte: period.endDate },
      },
    },
    select: { studentId: true, status: true },
  });
  const absByStudent = new Map<string, { absent: number; total: number }>();
  for (const r of attendance) {
    const s = absByStudent.get(r.studentId) ?? { absent: 0, total: 0 };
    s.total++;
    if (r.status === 'ABSENT') s.absent++;
    absByStudent.set(r.studentId, s);
  }

  // Calcul moyennes via fetchGradeRows logic minimale
  const grades = await tx.grade.findMany({
    where: { value: { not: null }, evaluation: { periodId } },
    select: {
      studentId: true,
      value: true,
      evaluation: {
        select: {
          weight: true,
          maxValue: true,
          subjectId: true,
          subject: { select: { scale: true, coefficient: true } },
        },
      },
    },
  });

  type SubAgg = { weighted: number; weights: number; scale: number; coefficient: number };
  const perStudent = new Map<string, Map<string, SubAgg>>();
  for (const g of grades) {
    let m = perStudent.get(g.studentId);
    if (!m) {
      m = new Map();
      perStudent.set(g.studentId, m);
    }
    let sa = m.get(g.evaluation.subjectId);
    if (!sa) {
      sa = {
        weighted: 0,
        weights: 0,
        scale: g.evaluation.subject.scale,
        coefficient: g.evaluation.subject.coefficient,
      };
      m.set(g.evaluation.subjectId, sa);
    }
    const norm = (g.value ?? 0) * (sa.scale / g.evaluation.maxValue);
    sa.weighted += norm * g.evaluation.weight;
    sa.weights += g.evaluation.weight;
  }

  const avgByStudent = new Map<string, number>();
  for (const [studentId, subjMap] of perStudent) {
    let cs = 0;
    let cw = 0;
    for (const [, sa] of subjMap) {
      if (sa.weights === 0) continue;
      const subjectAvg = sa.weighted / sa.weights;
      const normTo20 = subjectAvg * (20 / sa.scale);
      cw += normTo20 * sa.coefficient;
      cs += sa.coefficient;
    }
    if (cs > 0) avgByStudent.set(studentId, cw / cs);
  }

  // Combiner et filtrer
  const allStudentIds = new Set<string>([...absByStudent.keys(), ...avgByStudent.keys()]);
  const candidates: Array<{
    studentId: string;
    absenceRate: number | null;
    averageGrade: number | null;
    reasons: string[];
  }> = [];

  for (const id of allStudentIds) {
    const att = absByStudent.get(id);
    const absenceRate = att && att.total > 0 ? (att.absent / att.total) * 100 : null;
    const avg = avgByStudent.get(id) ?? null;

    const reasons: string[] = [];
    if (absenceRate !== null && absenceRate >= absenceThreshold) reasons.push('absence');
    if (avg !== null && avg < gradeThreshold) reasons.push('grade');
    if (reasons.length > 0) {
      candidates.push({ studentId: id, absenceRate, averageGrade: avg, reasons });
    }
  }

  if (candidates.length === 0) return [];

  // Récupérer les infos étudiants + classe
  const studentIds = candidates.map((c) => c.studentId);
  const persons = await tx.person.findMany({
    where: { id: { in: studentIds } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      studentClasses: {
        where: { unenrolledAt: null },
        take: 1,
        include: { class: { select: { id: true, name: true } } },
      },
    },
  });
  const personMap = new Map(persons.map((p) => [p.id, p]));

  // Sort par priorité : ceux avec les 2 raisons en premier, puis tri par absence puis par avg
  return candidates
    .map((c) => {
      const p = personMap.get(c.studentId);
      const cls = p?.studentClasses[0]?.class;
      return {
        studentId: c.studentId,
        firstName: p?.firstName ?? '',
        lastName: p?.lastName ?? '',
        classId: cls?.id ?? null,
        className: cls?.name ?? null,
        absenceRate: c.absenceRate,
        averageGrade: c.averageGrade,
        reasons: c.reasons,
      };
    })
    .sort((a, b) => {
      if (b.reasons.length !== a.reasons.length) return b.reasons.length - a.reasons.length;
      const aScore = (a.absenceRate ?? 0) - (a.averageGrade ?? 20);
      const bScore = (b.absenceRate ?? 0) - (b.averageGrade ?? 20);
      return bScore - aScore;
    })
    .slice(0, limit);
}

/**
 * Mention pour chaque élève rated (réutilise computeMention).
 */
export { computeMention };
