/**
 * Bornes de l'année scolaire active.
 *
 * Les absences et justifications affichées — écrans, tableaux de bord,
 * indicateurs — portent sur l'année active. Une date demandée hors de l'année
 * est ramenée à la borne la plus proche plutôt que de montrer, sans le dire,
 * les appels d'un autre exercice.
 */

/** Ramène un jour `AAAA-MM-JJ` dans l'intervalle [start, end]. */
export function clampDay(day: string, start: string, end: string): string {
  if (day < start) return start;
  if (day > end) return end;
  return day;
}

/** Plancher d'une date : une fenêtre glissante ne remonte pas avant la rentrée. */
export function floorDate(d: Date, min: Date | null | undefined): Date {
  return min && d < min ? min : d;
}
