/** Paramétrage par défaut de la bourse aux livres (référence, éditable). */
export const DEFAULT_BOOK_CONFIG = {
  commissionMode: 'PERCENT' as 'PERCENT' | 'FIXED',
  commissionValue: 0,
  // Prix bourse = prix neuf × facteur selon l'état.
  pricingByCondition: { NEW: 0.8, VERY_GOOD: 0.6, GOOD: 0.5, FAIR: 0.35 } as Record<string, number>,
  labelPrefix: 'BRS',
  // Comptes CGNC (référence) : caisse / dettes vendeurs / produit commission.
  accountMapping: { cash: '5161', sellerPayables: '4468', commission: '7588' } as Record<string, string>,
};

export const BOOK_CONDITIONS = ['NEW', 'VERY_GOOD', 'GOOD', 'FAIR'] as const;
export type BookConditionValue = (typeof BOOK_CONDITIONS)[number];

/** Prix bourse conseillé = prix neuf × facteur de l'état (arrondi). */
export function suggestedBoursePrice(priceNew: number, condition: string, factors: Record<string, number>): number {
  const f = factors[condition] ?? 0.5;
  return Math.round(priceNew * f * 100) / 100;
}
