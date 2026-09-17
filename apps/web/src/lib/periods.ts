/**
 * Sélection de la période (trimestre / semestre) affichée par défaut.
 *
 * Ordre de priorité :
 *  1. la période explicitement demandée (`?period=…`) si elle existe ;
 *  2. le trimestre **en cours** (date du jour comprise entre startDate et endDate) ;
 *  3. hors période (vacances, fin d'année) : le **dernier trimestre commencé**
 *     (ex. en juillet, après la fin du T3 → T3, et non le T1) ;
 *  4. à défaut, le premier de la liste.
 *
 * `periods` doit être trié par `startDate` croissant.
 */
export type PeriodLike = { id: string; startDate: Date; endDate: Date };

export function pickPeriod<T extends PeriodLike>(
  periods: T[],
  requestedId?: string | null,
  now: Date = new Date(),
): T | null {
  const requested = requestedId ? periods.find((p) => p.id === requestedId) : undefined;
  if (requested) return requested;
  const current = periods.find((p) => p.startDate <= now && now <= p.endDate);
  if (current) return current;
  const started = periods.filter((p) => p.startDate <= now);
  return started[started.length - 1] ?? periods[0] ?? null;
}

/**
 * Périodes de scolarité : trimestres et semestres, sans les sessions d'examen
 * (évaluation diagnostique…).
 *
 * Ces sessions sont des fenêtres de quelques jours, créées pour rattacher les
 * épreuves d'une session : les mêler aux trimestres dans un sélecteur de
 * pilotage ou de suivi des absences fausse la lecture.
 */
export function schoolPeriods<T extends { kind?: string }>(periods: T[]): T[] {
  return periods.filter((p) => p.kind !== 'SESSION');
}

/** Raccourci : id de la période par défaut (ou null). */
export function pickPeriodId(
  periods: PeriodLike[],
  requestedId?: string | null,
  now: Date = new Date(),
): string | null {
  return pickPeriod(periods, requestedId, now)?.id ?? null;
}
