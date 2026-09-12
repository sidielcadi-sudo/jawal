/**
 * Mesures d'une classe : moyenne, assiduité, remplissage.
 *
 * Servent les colonnes et les cartes de la **liste des classes**. Calcul pur,
 * alimenté par la page : chaque mesure rend `null` quand elle n'a pas de base
 * — un 0 % d'assiduité sur une classe jamais pointée se lirait comme une
 * catastrophe au lieu d'une absence de donnée.
 */

export type GradeRow = {
  studentId: string;
  value: number;
  /** Poids du devoir dans la matière. */
  weight: number;
  /** Barème du devoir (souvent 20, parfois 10 ou 100). */
  maxValue: number;
  /** Coefficient de la matière. */
  coefficient: number;
};

/**
 * Moyenne d'un ensemble de notes, ramenée sur 20.
 *
 * Chaque note est d'abord normalisée par son barème : additionner un 8/10 et
 * un 16/20 sans cela donnerait 24 points sur une échelle inconnue. Le poids du
 * devoir et le coefficient de la matière se multiplient — une interrogation
 * double dans une matière à coefficient 4 pèse huit fois une interrogation
 * simple à coefficient 1.
 */
export function weightedAverage20(rows: GradeRow[]): number | null {
  let num = 0;
  let den = 0;
  for (const r of rows) {
    if (r.maxValue <= 0) continue;
    const w = Math.max(0, r.weight) * Math.max(0, r.coefficient);
    if (w === 0) continue;
    num += (r.value / r.maxValue) * 20 * w;
    den += w;
  }
  return den > 0 ? Math.round((num / den) * 10) / 10 : null;
}

export type AttendanceCounts = {
  present: number;
  absent: number;
  late: number;
  excused: number;
};

/**
 * Taux d'assiduité : part des présences sur les pointages.
 *
 * Retards et excusés comptent comme présents — l'élève est là, ou son absence
 * est couverte. Les compter comme absents ferait chuter le taux d'une classe
 * ponctuellement embouteillée.
 */
export function attendanceRate(c: AttendanceCounts): number | null {
  const total = c.present + c.absent + c.late + c.excused;
  if (total === 0) return null;
  return Math.round(((c.present + c.late + c.excused) / total) * 1000) / 10;
}

/** Taux de remplissage, pour la carte « Remplissage global » de la liste. */
export function fillRate(enrolled: number, capacity: number): number | null {
  return capacity > 0 ? Math.round((enrolled / capacity) * 1000) / 10 : null;
}

/**
 * Moyenne de la classe et écart avec le reste de l'établissement.
 *
 * La référence exclut les élèves de la classe : la comparer à un ensemble qui
 * la contient écrase l'écart, d'autant plus que la classe est grosse.
 */
export function averageWithDelta(
  classRows: GradeRow[],
  schoolRows: GradeRow[],
): { average: number | null; delta: number | null } {
  const average = weightedAverage20(classRows);
  const classIds = new Set(classRows.map((r) => r.studentId));
  const reference = weightedAverage20(schoolRows.filter((r) => !classIds.has(r.studentId)));
  return {
    average,
    delta:
      average !== null && reference !== null ? Math.round((average - reference) * 10) / 10 : null,
  };
}

/**
 * Part réglée des frais **échus** de la classe.
 *
 * Rapporter l'encaissé au total annuel afficherait un taux dérisoire en
 * septembre, alors que rien n'est en retard.
 */
export function settlementRate(dueToDate: number, paidToDate: number): number | null {
  if (dueToDate <= 0) return null;
  return Math.round((paidToDate / dueToDate) * 1000) / 10;
}

/** Seuils de couleur communs aux cartes. */
export function kpiTone(
  value: number | null,
  good: number,
  warn: number,
): 'good' | 'warn' | 'bad' | 'none' {
  if (value === null) return 'none';
  if (value >= good) return 'good';
  if (value >= warn) return 'warn';
  return 'bad';
}
