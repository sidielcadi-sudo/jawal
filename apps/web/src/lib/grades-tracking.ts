/**
 * Suivi des notes, évaluations et examens — le tableau de pilotage de la page
 * Notes.
 *
 * Une ligne par épreuve, qu'elle vienne d'une évaluation de classe (contrôle,
 * devoir) ou d'une session d'examen (blanc, régional…). Deux sources, un seul
 * vocabulaire : le type, la saisie des copies, la moyenne, et ce qu'il reste à
 * faire (consulter, saisir, relancer).
 *
 * Ce module ne lit pas la base : il reçoit des lignes déjà assemblées et en
 * tire les statuts et les indicateurs, pour pouvoir être testé et recalculé
 * côté navigateur quand on filtre.
 */
import { EXAM_KIND_GROUPS, type ExamKindGroup, type ExamKindValue } from './exam-kinds';

export type TrackingSource = 'EVALUATION' | 'EXAM';

/**
 * - `DONE` : toutes les copies sont saisies ;
 * - `UPCOMING` : l'épreuve n'a pas encore eu lieu ;
 * - `IN_PROGRESS` : passée, saisie incomplète, encore dans le délai ;
 * - `LATE` : passée depuis plus de `LATE_AFTER_DAYS` jours, saisie incomplète.
 */
export type TrackingStatus = 'DONE' | 'UPCOMING' | 'IN_PROGRESS' | 'LATE';

/** Délai de correction au-delà duquel une saisie incomplète est en retard. */
export const LATE_AFTER_DAYS = 7;

export type TrackingRow = {
  id: string;
  source: TrackingSource;
  label: string;
  kind: ExamKindValue;
  classId: string | null;
  classLabel: string;
  subjectLabel: string;
  teacherLabel: string;
  /** AAAA-MM-JJ */
  date: string;
  coefficient: number;
  /** Copies saisies / copies attendues. */
  entered: number;
  expected: number;
  /** Somme des notes ramenées sur 20, nombre de notes, notes ≥ 10/20. */
  sum20: number;
  count: number;
  passed: number;
  href: string;
  status: TrackingStatus;
  average: number | null;
};

const strip = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/**
 * Type d'une évaluation de classe, d'après son intitulé.
 *
 * Une évaluation ne porte pas de type en base : c'est l'enseignant qui la
 * nomme (« DS 2 », « Devoir maison », « Interrogation écrite »…). On lit donc
 * l'intitulé. Par défaut, une évaluation de classe est un contrôle continu.
 * L'ordre compte : « Examen blanc » est un blanc avant d'être un examen.
 */
export function inferEvaluationKind(label: string): ExamKindValue {
  const s = strip(label);
  if (/\bblanc/.test(s)) return 'BLANC';
  if (/\b(composition|examen)\b/.test(s)) return 'COMPOSITION';
  if (/\bdm\b|devoir(s)? (a la )?maison|\bmaison\b/.test(s)) return 'DEVOIR_MAISON';
  if (/\b(ds|dst)\b|devoir(s)? (surveille|sur table)|\bdevoir/.test(s)) return 'DEVOIR_SURVEILLE';
  return 'CONTROLE_CONTINU';
}

/** Famille d'un type, pour le filtre « Type d'épreuve ». */
export function kindFamily(kind: ExamKindValue): ExamKindGroup {
  if (kind === 'SEMESTRIEL') return 'INTERNES';
  return EXAM_KIND_GROUPS.find((g) => (g.kinds as readonly string[]).includes(kind))!.key;
}

const dayDiff = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export function trackingStatus(
  r: { entered: number; expected: number; date: string },
  today: string,
  lateAfterDays = LATE_AFTER_DAYS,
): TrackingStatus {
  // Aucune copie attendue : rien n'est en souffrance.
  if (r.expected === 0) return r.date > today ? 'UPCOMING' : 'DONE';
  if (r.entered >= r.expected) return 'DONE';
  if (r.date > today) return 'UPCOMING';
  return dayDiff(r.date, today) > lateAfterDays ? 'LATE' : 'IN_PROGRESS';
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export type TrackingSummary = {
  /** Moyenne de toutes les notes, ramenées sur 20. */
  average: number | null;
  total: number;
  controls: number;
  exams: number;
  /** Part des copies saisies, épreuves à venir exclues (en %). */
  completion: number | null;
  late: number;
  /** Part des notes ≥ 10/20 (en %). */
  success: number | null;
  passed: number;
  count: number;
};

export function summarize(rows: TrackingRow[]): TrackingSummary {
  let sum20 = 0;
  let count = 0;
  let passed = 0;
  let entered = 0;
  let expected = 0;
  for (const r of rows) {
    sum20 += r.sum20;
    count += r.count;
    passed += r.passed;
    // Une épreuve à venir n'a pas encore de copies : la compter ferait
    // baisser la complétion pour de mauvaises raisons.
    if (r.status !== 'UPCOMING') {
      entered += Math.min(r.entered, r.expected);
      expected += r.expected;
    }
  }
  return {
    average: count > 0 ? round1(sum20 / count) : null,
    total: rows.length,
    controls: rows.filter((r) => r.source === 'EVALUATION').length,
    exams: rows.filter((r) => r.source === 'EXAM').length,
    completion: expected > 0 ? round1((entered / expected) * 100) : null,
    late: rows.filter((r) => r.status === 'LATE').length,
    success: count > 0 ? round1((passed / count) * 100) : null,
    passed,
    count,
  };
}

/** Écart de moyenne avec la période précédente, en points. */
export function averageDelta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return round1(current - previous);
}

/** Recherche plein texte : intitulé, matière, enseignant, classe — sans accents. */
export function matchesSearch(r: TrackingRow, query: string): boolean {
  const q = strip(query.trim());
  if (!q) return true;
  return strip(`${r.label} ${r.subjectLabel} ${r.teacherLabel} ${r.classLabel}`).includes(q);
}

/** Agrège les notes d'une épreuve (valeurs nulles = copie non saisie). */
export function gradeStats(values: Array<number | null>, maxValue: number) {
  const scored = values.filter((v): v is number => v !== null);
  const on20 = scored.map((v) => (maxValue > 0 ? (v / maxValue) * 20 : v));
  const sum20 = on20.reduce((a, b) => a + b, 0);
  return {
    sum20,
    count: on20.length,
    passed: on20.filter((v) => v >= 10).length,
    average: on20.length > 0 ? round1(sum20 / on20.length) : null,
  };
}
