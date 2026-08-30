import 'server-only';
import type { Prisma } from '@/lib/db';
import type { BilingualNameFields } from '@/lib/localized-name';

/**
 * Modèle de calcul des moyennes :
 *
 * 1. Pour une matière, on normalise chaque note à l'échelle de la matière :
 *      norm = grade.value * (subject.scale / evaluation.maxValue)
 *
 * 2. Moyenne de la matière = moyenne pondérée par evaluation.weight :
 *      subject_avg = Σ(norm * weight) / Σ(weight)
 *
 * 3. Moyenne générale = moyenne pondérée des moyennes de matière par
 *    subject.coefficient :
 *      general_avg = Σ(subject_avg * coefficient) / Σ(coefficient)
 *
 *    Note : seules les matières où l'élève a au moins 1 note comptent.
 */

export type SubjectStat = {
  subjectId: string;
  subjectLabel: string;
  subjectScale: number;
  subjectCoefficient: number;
  subjectOrder: number;
  /** Moyenne normalisée à l'échelle de la matière, ou null si aucune note. */
  average: number | null;
  /** Nombre de notes (non-null) prises en compte. */
  gradeCount: number;
  /** Min / max parmi les notes normalisées à l'échelle de la matière. */
  min: number | null;
  max: number | null;
  /** Rang de l'élève dans la classe pour cette matière (1 = meilleur). */
  rank?: number | null;
};

export type StudentReport = {
  studentId: string;
  subjects: SubjectStat[];
  /** Moyenne générale normalisée. null si l'élève n'a aucune note. */
  generalAverage: number | null;
};

type RawRow = {
  studentId: string;
  value: number;
  weight: number;
  maxValue: number;
  subjectId: string;
  subjectLabel: string;
  subjectScale: number;
  subjectCoefficient: number;
  subjectOrder: number;
};

type Tx = Prisma.TransactionClient;

/**
 * Récupère toutes les notes d'une classe pour une période et les met à plat.
 * Une seule requête — économique même pour 30 élèves × 10 matières × 5 évals.
 *
 * Si une entrée CurriculumSubject(level, subject) existe pour le niveau de la
 * classe, son coefficient remplace celui de Subject.coefficient (fallback).
 */
async function fetchGradeRows(tx: Tx, classId: string, periodId: string): Promise<RawRow[]> {
  const [grades, classRow] = await Promise.all([
    tx.grade.findMany({
      where: {
        value: { not: null },
        evaluation: { classId, periodId },
      },
      select: {
        studentId: true,
        value: true,
        evaluation: {
          select: {
            weight: true,
            maxValue: true,
            subject: {
              select: {
                id: true,
                label: true,
                scale: true,
                coefficient: true,
                order: true,
              },
            },
          },
        },
      },
    }),
    tx.class.findUnique({ where: { id: classId }, select: { levelId: true } }),
  ]);

  // Coef paramétré au niveau (programme) — fallback sur Subject.coefficient.
  const coefMap = new Map<string, number>();
  if (classRow?.levelId) {
    const subjectIds = [...new Set(grades.map((g) => g.evaluation.subject.id))];
    if (subjectIds.length > 0) {
      const entries = await tx.curriculumSubject.findMany({
        where: { levelId: classRow.levelId, subjectId: { in: subjectIds } },
        select: { subjectId: true, coefficient: true, order: true },
      });
      for (const e of entries) coefMap.set(e.subjectId, e.coefficient);
    }
  }

  return grades
    .filter((g): g is typeof g & { value: number } => g.value !== null)
    .map((g) => ({
      studentId: g.studentId,
      value: g.value,
      weight: g.evaluation.weight,
      maxValue: g.evaluation.maxValue,
      subjectId: g.evaluation.subject.id,
      subjectLabel: g.evaluation.subject.label,
      subjectScale: g.evaluation.subject.scale,
      subjectCoefficient:
        coefMap.get(g.evaluation.subject.id) ?? g.evaluation.subject.coefficient,
      subjectOrder: g.evaluation.subject.order,
    }));
}

function computeSubjectStat(
  subjectId: string,
  rows: RawRow[],
): Omit<SubjectStat, 'subjectId' | 'subjectLabel' | 'subjectScale' | 'subjectCoefficient' | 'subjectOrder'> {
  const filtered = rows.filter((r) => r.subjectId === subjectId);
  if (filtered.length === 0) {
    return { average: null, gradeCount: 0, min: null, max: null };
  }
  const normalized = filtered.map((r) => ({
    n: r.value * (r.subjectScale / r.maxValue),
    weight: r.weight,
  }));
  const sumWeighted = normalized.reduce((s, x) => s + x.n * x.weight, 0);
  const sumWeights = normalized.reduce((s, x) => s + x.weight, 0);
  const values = normalized.map((x) => x.n);
  return {
    average: sumWeights > 0 ? sumWeighted / sumWeights : null,
    gradeCount: filtered.length,
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

/**
 * Bulletin individuel d'un élève pour une période donnée, dans une classe.
 * Renvoie les stats par matière + la moyenne générale.
 */
export async function computeStudentReport(
  tx: Tx,
  params: { classId: string; periodId: string; studentId: string; allSubjects: SubjectMeta[] },
): Promise<StudentReport> {
  const rows = (await fetchGradeRows(tx, params.classId, params.periodId)).filter(
    (r) => r.studentId === params.studentId,
  );

  const subjects: SubjectStat[] = params.allSubjects.map((s) => {
    const stat = computeSubjectStat(s.id, rows);
    return {
      subjectId: s.id,
      subjectLabel: s.label,
      subjectScale: s.scale,
      subjectCoefficient: s.coefficient,
      subjectOrder: s.order,
      ...stat,
    };
  });

  // Moyenne générale : pondération par coefficient sur les matières avec note
  const rated = subjects.filter((s) => s.average !== null);
  let generalAverage: number | null = null;
  if (rated.length > 0) {
    const sumCoef = rated.reduce((s, x) => s + x.subjectCoefficient, 0);
    const sumWeighted = rated.reduce((s, x) => s + (x.average ?? 0) * x.subjectCoefficient, 0);
    generalAverage = sumCoef > 0 ? sumWeighted / sumCoef : null;
  }

  return { studentId: params.studentId, subjects, generalAverage };
}

export type SubjectMeta = {
  id: string;
  label: string;
  scale: number;
  coefficient: number;
  order: number;
};

/**
 * Carnet de notes complet d'une classe pour une période : tous les élèves
 * inscrits actifs × toutes les matières, plus les moyennes de classe.
 */
export async function computeClassBook(
  tx: Tx,
  params: {
    classId: string;
    periodId: string;
    students: (BilingualNameFields & { id: string })[];
    allSubjects: SubjectMeta[];
  },
): Promise<{
  rows: Array<{
    studentId: string;
    firstName: string;
    lastName: string;
    firstNameAr: string | null;
    lastNameAr: string | null;
    subjects: SubjectStat[];
    generalAverage: number | null;
    generalRank: number | null;
    ratedStudents: number;
  }>;
  classSubjectAverages: Map<string, number | null>;
  classGeneralAverage: number | null;
}> {
  const allRows = await fetchGradeRows(tx, params.classId, params.periodId);

  const rows = params.students.map((s) => {
    const studentRows = allRows.filter((r) => r.studentId === s.id);
    const subjects: SubjectStat[] = params.allSubjects.map((subj) => {
      const stat = computeSubjectStat(subj.id, studentRows);
      return {
        subjectId: subj.id,
        subjectLabel: subj.label,
        subjectScale: subj.scale,
        subjectCoefficient: subj.coefficient,
        subjectOrder: subj.order,
        ...stat,
      };
    });
    const rated = subjects.filter((s) => s.average !== null);
    let generalAverage: number | null = null;
    if (rated.length > 0) {
      const sumCoef = rated.reduce((s, x) => s + x.subjectCoefficient, 0);
      const sumWeighted = rated.reduce((s, x) => s + (x.average ?? 0) * x.subjectCoefficient, 0);
      generalAverage = sumCoef > 0 ? sumWeighted / sumCoef : null;
    }
    return {
      studentId: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      firstNameAr: s.firstNameAr,
      lastNameAr: s.lastNameAr,
      subjects,
      generalAverage,
      generalRank: null as number | null,
      ratedStudents: 0,
    };
  });

  // Moyenne de classe par matière (moyenne arithmétique des moyennes d'élèves)
  const classSubjectAverages = new Map<string, number | null>();
  for (const subj of params.allSubjects) {
    const vals = rows.map((r) => r.subjects.find((x) => x.subjectId === subj.id)?.average ?? null).filter((v): v is number => v !== null);
    classSubjectAverages.set(subj.id, vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null);
  }

  // Rangs par matière (1 = meilleure moyenne, égalités → même rang, "1224")
  const subjectRanks = new Map<string, Map<string, number>>(); // subjectId → studentId → rank
  for (const subj of params.allSubjects) {
    const ranked = rows
      .map((r) => ({
        studentId: r.studentId,
        avg: r.subjects.find((x) => x.subjectId === subj.id)?.average ?? null,
      }))
      .filter((x): x is { studentId: string; avg: number } => x.avg !== null)
      .sort((a, b) => b.avg - a.avg);

    const map = new Map<string, number>();
    let currentRank = 0;
    let lastAvg: number | null = null;
    for (let i = 0; i < ranked.length; i++) {
      if (ranked[i]!.avg !== lastAvg) {
        currentRank = i + 1;
        lastAvg = ranked[i]!.avg;
      }
      map.set(ranked[i]!.studentId, currentRank);
    }
    subjectRanks.set(subj.id, map);
  }

  // Inject ranks dans chaque row.subjects
  for (const r of rows) {
    for (const s of r.subjects) {
      const rank = subjectRanks.get(s.subjectId)?.get(r.studentId) ?? null;
      (s as SubjectStat & { rank: number | null }).rank = rank;
    }
  }

  // Rang général
  const generalRanking = rows
    .filter((r): r is typeof r & { generalAverage: number } => r.generalAverage !== null)
    .sort((a, b) => b.generalAverage - a.generalAverage);
  const generalRatedCount = generalRanking.length;
  let currentRank = 0;
  let lastAvg: number | null = null;
  const generalRankMap = new Map<string, number>();
  for (let i = 0; i < generalRanking.length; i++) {
    if (generalRanking[i]!.generalAverage !== lastAvg) {
      currentRank = i + 1;
      lastAvg = generalRanking[i]!.generalAverage;
    }
    generalRankMap.set(generalRanking[i]!.studentId, currentRank);
  }
  for (const r of rows) {
    r.generalRank = generalRankMap.get(r.studentId) ?? null;
    r.ratedStudents = generalRatedCount;
  }

  // Moyenne générale de classe
  const generals = rows.map((r) => r.generalAverage).filter((v): v is number => v !== null);
  const classGeneralAverage = generals.length > 0 ? generals.reduce((a, b) => a + b, 0) / generals.length : null;

  return { rows, classSubjectAverages, classGeneralAverage };
}

/**
 * Mention basée sur la moyenne (normalisée /20 si scale ≠ 20).
 * Convention scolaire Maroc / France.
 */
export type Mention =
  | 'EXCELLENT'   // ≥ 18
  | 'TRES_BIEN'   // 16-17.99
  | 'BIEN'        // 14-15.99
  | 'ASSEZ_BIEN'  // 12-13.99
  | 'PASSABLE'    // 10-11.99
  | 'INSUFFISANT' // < 10
  | null;

export function computeMention(value: number | null, scale = 20): Mention {
  if (value === null) return null;
  const v = value * (20 / scale);
  if (v >= 18) return 'EXCELLENT';
  if (v >= 16) return 'TRES_BIEN';
  if (v >= 14) return 'BIEN';
  if (v >= 12) return 'ASSEZ_BIEN';
  if (v >= 10) return 'PASSABLE';
  return 'INSUFFISANT';
}
