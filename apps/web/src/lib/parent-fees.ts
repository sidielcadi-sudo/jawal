/**
 * Règlement côté parents : couleur d'une échéance et répartition par année.
 *
 * Trois couleurs, lisibles d'un coup d'œil :
 *  - **vert** : payée ;
 *  - **rouge** : échue et non payée ;
 *  - **orange** : à échoir bientôt (sous `SOON_DAYS` jours) ;
 * les échéances plus lointaines restent neutres.
 */
export const SOON_DAYS = 30;

export type FeeTone = 'paid' | 'overdue' | 'soon' | 'upcoming';

export function feeTone(remaining: number, dueDate: Date, today: Date, soonDays = SOON_DAYS): FeeTone {
  if (remaining <= 0.01) return 'paid';
  const day = (x: Date) => Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
  const diff = Math.round((day(dueDate) - day(today)) / 86_400_000);
  if (diff < 0) return 'overdue';
  return diff <= soonDays ? 'soon' : 'upcoming';
}

type YearLike = { id: string; startDate: Date; endDate: Date };

/**
 * Onglet d'une échéance : l'année active, ou les créances antérieures.
 *
 * Même règle que la gestion des impayés : un frais exceptionnel porte son
 * année ; les autres échéances se rangent par leur date. Une échéance d'une
 * année postérieure (rare) reste avec l'année en cours plutôt que d'être
 * présentée comme une dette ancienne.
 */
export function feeTab(
  fee: { dueDate: Date; declaredYearId: string | null },
  years: YearLike[],
  activeYear: YearLike | null,
): 'current' | 'previous' {
  if (!activeYear) return 'current';
  const year =
    (fee.declaredYearId ? years.find((y) => y.id === fee.declaredYearId) : undefined) ??
    years.find((y) => fee.dueDate >= y.startDate && fee.dueDate <= y.endDate);
  const start = year ? year.startDate : fee.dueDate;
  return start < activeYear.startDate ? 'previous' : 'current';
}
