/**
 * Catégorie « vie scolaire » unique d'un record d'appel, dérivée du statut de
 * présence et des marqueurs. Un élève n'a qu'UNE catégorie par séance.
 *
 * Règle de comptage (décision établissement) :
 *  - comptent comme PRÉSENT (n'impactent pas le taux) : Présent, Retard,
 *    Infirmerie, Punition, Dispense ;
 *  - DIMINUENT le taux (non présents) : Absence, Exclusion.
 *
 * Côté stockage : Infirmerie/Punition → status PRESENT + marqueur ; Exclusion →
 * status ABSENT + marqueur. Ainsi « présent = status ≠ ABSENT » reste vrai
 * partout (cohérent avec les KPI existants), et la catégorie fine sert à
 * l'affichage détaillé.
 */
export type AttendanceCategory =
  | 'PRESENT'
  | 'LATE'
  | 'EXCUSED'
  | 'INFIRMARY'
  | 'PUNISHMENT'
  | 'ABSENT'
  | 'EXCLUSION';

/** Ordre d'affichage stable des catégories. */
export const ATTENDANCE_CATEGORIES: AttendanceCategory[] = [
  'PRESENT',
  'LATE',
  'INFIRMARY',
  'PUNISHMENT',
  'EXCLUSION',
  'EXCUSED',
  'ABSENT',
];

export type AttendanceLike = {
  status: string;
  infirmary?: boolean | null;
  punishment?: boolean | null;
  exclusion?: boolean | null;
};

/** Catégorie unique d'un record (priorité aux marqueurs disciplinaires). */
export function categoryOf(r: AttendanceLike): AttendanceCategory {
  if (r.exclusion) return 'EXCLUSION';
  if (r.punishment) return 'PUNISHMENT';
  if (r.infirmary) return 'INFIRMARY';
  if (r.status === 'ABSENT') return 'ABSENT';
  if (r.status === 'LATE') return 'LATE';
  if (r.status === 'EXCUSED') return 'EXCUSED';
  return 'PRESENT';
}

const PRESENT_LIKE = new Set<AttendanceCategory>([
  'PRESENT',
  'LATE',
  'EXCUSED',
  'INFIRMARY',
  'PUNISHMENT',
]);

/** La catégorie compte-t-elle comme « présent » (pas d'impact sur le taux) ? */
export function countsPresent(c: AttendanceCategory): boolean {
  return PRESENT_LIKE.has(c);
}

/** Objet de comptage initialisé à zéro pour chaque catégorie. */
export function emptyAttendanceCounts(): Record<AttendanceCategory, number> {
  return {
    PRESENT: 0,
    LATE: 0,
    EXCUSED: 0,
    INFIRMARY: 0,
    PUNISHMENT: 0,
    ABSENT: 0,
    EXCLUSION: 0,
  };
}

/** Décompte par catégorie + taux de présence (présents / total). */
export function tallyAttendance(records: AttendanceLike[]) {
  const counts = emptyAttendanceCounts();
  let present = 0;
  for (const r of records) {
    const c = categoryOf(r);
    counts[c] += 1;
    if (countsPresent(c)) present += 1;
  }
  const total = records.length;
  return { counts, present, total, rate: total > 0 ? (present / total) * 100 : null };
}
