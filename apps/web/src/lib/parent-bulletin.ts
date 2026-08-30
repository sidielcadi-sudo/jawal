import 'server-only';
import type { Prisma } from '@/lib/db';

type Tx = Prisma.TransactionClient;

export type ClassBulletinRow = {
  subject: string;
  /** Moyenne de classe (notes non nulles), sur 20 normalisé. */
  classAvg: number | null;
  min: number | null;
  max: number | null;
  /** Moyenne de l'enfant dans la matière (sur 20 normalisé). */
  childAvg: number | null;
  /** Rang de l'enfant dans la matière (1 = meilleur), null si pas de note. */
  childRank: number | null;
  /** Effectif noté dans la matière. */
  graded: number;
};

/**
 * « Bulletin de la classe » côté parent — **anonyme** : par matière, moyenne de
 * classe + min/max + moyenne et rang de l'enfant, sans révéler les notes
 * nominatives des autres élèves. Calculé sur une période donnée à partir des
 * évaluations de la classe (notes normalisées sur 20).
 */
export async function loadClassBulletin(
  tx: Tx,
  classId: string,
  periodId: string,
  childId: string,
): Promise<ClassBulletinRow[]> {
  const evals = await tx.evaluation.findMany({
    where: { classId, periodId },
    select: {
      maxValue: true,
      subject: { select: { label: true, labelAr: true } },
      grades: { select: { studentId: true, value: true } },
    },
  });

  // subject → studentId → liste de notes /20
  const bySubject = new Map<string, Map<string, number[]>>();
  for (const e of evals) {
    const max = e.maxValue || 20;
    const subj = e.subject.label;
    const perStudent = bySubject.get(subj) ?? new Map<string, number[]>();
    for (const g of e.grades) {
      if (g.value === null) continue;
      const norm = (g.value / max) * 20;
      const arr = perStudent.get(g.studentId) ?? [];
      arr.push(norm);
      perStudent.set(g.studentId, arr);
    }
    bySubject.set(subj, perStudent);
  }

  const rows: ClassBulletinRow[] = [];
  for (const [subject, perStudent] of [...bySubject.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    // Moyenne par élève dans la matière.
    const studentAverages: { studentId: string; avg: number }[] = [];
    for (const [studentId, marks] of perStudent.entries()) {
      if (marks.length === 0) continue;
      studentAverages.push({
        studentId,
        avg: marks.reduce((s, x) => s + x, 0) / marks.length,
      });
    }
    if (studentAverages.length === 0) {
      rows.push({ subject, classAvg: null, min: null, max: null, childAvg: null, childRank: null, graded: 0 });
      continue;
    }
    const avgs = studentAverages.map((s) => s.avg);
    const classAvg = avgs.reduce((s, x) => s + x, 0) / avgs.length;
    const min = Math.min(...avgs);
    const max = Math.max(...avgs);
    const childAvg = studentAverages.find((s) => s.studentId === childId)?.avg ?? null;
    // Rang : 1 + nb d'élèves strictement au-dessus.
    const childRank =
      childAvg === null
        ? null
        : 1 + studentAverages.filter((s) => s.avg > childAvg + 1e-9).length;
    rows.push({
      subject,
      classAvg: round2(classAvg),
      min: round2(min),
      max: round2(max),
      childAvg: childAvg === null ? null : round2(childAvg),
      childRank,
      graded: studentAverages.length,
    });
  }
  return rows;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
