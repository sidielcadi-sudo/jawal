import 'server-only';

/**
 * Portée d'une réduction tarifaire.
 *
 * Trois formes coexistent, par ordre d'ancienneté :
 *  - `feeScheduleItemId` renseigné → un seul frais (ciblage historique) ;
 *  - relation `fees` non vide → la sélection cochée au paramétrage ;
 *  - ni l'un ni l'autre → la réduction porte sur **tous** les frais.
 *
 * Le ciblage historique reste lu pour ne pas invalider les réductions déjà
 * saisies : le formulaire n'écrit plus que la sélection multiple.
 */

/** Filtre Prisma : réductions actives applicables à un frais donné. */
export const discountsForFeeWhere = (feeId: string) => ({
  active: true,
  OR: [
    { fees: { some: { id: feeId } } },
    { feeScheduleItemId: feeId },
    { feeScheduleItemId: null, fees: { none: {} } },
  ],
});

/** Forme minimale d'une règle pour décider de sa portée côté JS. */
export type DiscountScope = {
  feeScheduleItemId: string | null;
  fees: { id: string }[];
};

/** La réduction s'applique-t-elle à ce frais ? (pendant JS du filtre ci-dessus) */
export function discountAppliesToFee(rule: DiscountScope, feeId: string): boolean {
  if (rule.fees.length > 0) return rule.fees.some((f) => f.id === feeId);
  if (rule.feeScheduleItemId) return rule.feeScheduleItemId === feeId;
  return true; // aucune restriction → tous les frais
}
