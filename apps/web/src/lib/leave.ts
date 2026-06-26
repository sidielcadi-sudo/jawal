/**
 * Congés du personnel : calculs (jours ouvrés, solde acquis à la volée).
 *
 * Solde « à la volée » : acquis = mois depuis l'embauche × acquisition mensuelle
 * du type (ex. 1,5 j/mois au Maroc) ; solde = acquis − jours déjà pris (approuvés).
 * Aucun cron : toujours recalculé à l'affichage.
 */

const round = (n: number) => Math.round(n * 100) / 100;

/** Nombre de mois entiers écoulés entre deux dates (≥ 0). */
export function monthsBetween(from: Date, to: Date): number {
  const m = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  return Math.max(0, to.getUTCDate() >= from.getUTCDate() ? m : m - 1);
}

/**
 * Jours ouvrés entre deux dates incluses (dimanche exclu — semaine marocaine
 * Lun→Sam). Les jours fériés ne sont pas déduits en v1.
 */
export function workingDaysBetween(start: Date, end: Date): number {
  let n = 0;
  const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (d <= last) {
    if (d.getUTCDay() !== 0) n++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

/** Solde acquis/pris/restant pour un type de congé qui accumule. */
export function computeLeaveBalance(opts: {
  hireDate: Date | null;
  accrualPerMonth: number | null;
  takenDays: number;
}): { acquired: number; taken: number; balance: number } {
  const acquired =
    opts.hireDate && opts.accrualPerMonth
      ? round(monthsBetween(opts.hireDate, new Date()) * opts.accrualPerMonth)
      : 0;
  return { acquired, taken: round(opts.takenDays), balance: round(acquired - opts.takenDays) };
}
