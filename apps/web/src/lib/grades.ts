import 'server-only';
import type { Prisma } from '@/lib/db';

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
 */
async function fetchGradeRows(tx: Tx, classId: string, periodId: string): Promise<RawRow[]> {
  const grades = await tx.grade.findMany({
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
  });

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
      subjectCoefficient: g.evaluation.subject.coefficient,
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
    students: { id: string; firstName: string; lastName: string }[];
    allSubjects: SubjectMeta[];
  },
): Promise<{
  rows: Array<{
    studentId: string;
    firstName: string;
    lastName: string;
    subjects: SubjectStat[];
    generalAverage: number | null;
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
      subjects,
      generalAverage,
    };
  });

  // Moyenne de classe par matière (moyenne arithmétique des moyennes d'élèves)
  const classSubjectAverages = new Map<string, number | null>();
  for (const subj of params.allSubjects) {
    const vals = rows.map((r) => r.subjects.find((x) => x.subjectId === subj.id)?.average ?? null).filter((v): v is number => v !== null);
    classSubjectAverages.set(subj.id, vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null);
  }

  // Moyenne générale de classe
  const generals = rows.map((r) => r.generalAverage).filter((v): v is number => v !== null);
  const classGeneralAverage = generals.length > 0 ? generals.reduce((a, b) => a + b, 0) / generals.length : null;

  return { rows, classSubjectAverages, classGeneralAverage };
}
