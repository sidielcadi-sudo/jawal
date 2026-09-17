/**
 * Durée d'une absence : journée entière, demi-journée ou nombre de séances.
 *
 * Une absence ne se compte pas toujours en jours pleins — un professeur peut
 * ne manquer que la matinée, ou deux heures de cours. Le décompte et les
 * séances concernées suivent la même règle, définie ici une fois.
 */
export type DayPart = 'FULL' | 'AM' | 'PM' | 'SESSIONS';

/** Séances d'une journée type, pour convertir des séances en jours. */
export const SESSIONS_PER_DAY = 6;

/** Jours décomptés, à partir des jours ouvrés de la période. */
export function leaveDays(
  workingDays: number,
  dayPart: DayPart,
  sessionCount?: number | null,
): number {
  if (dayPart === 'SESSIONS') {
    const n = Math.max(0, sessionCount ?? 0);
    return Math.round((n / SESSIONS_PER_DAY) * 100) / 100;
  }
  if (dayPart === 'AM' || dayPart === 'PM') return Math.round(workingDays * 0.5 * 100) / 100;
  return workingDays;
}

/** Une séance qui commence à `startTime` (HH:MM) tombe-t-elle dans la portée ? */
export function slotInPart(startTime: string, dayPart: DayPart): boolean {
  if (dayPart === 'AM') return startTime < '12:00';
  if (dayPart === 'PM') return startTime >= '12:00';
  return true;
}
