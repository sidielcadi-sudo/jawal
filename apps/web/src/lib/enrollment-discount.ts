/**
 * Réductions tarifaires d'une inscription.
 *
 * - Réduction fratrie : appliquée selon le rang (1 = aîné, sans réduction ;
 *   2, 3, … = cadets, avec un pourcentage configurable au niveau tenant).
 * - Réduction manuelle : l'agent peut écraser avec un % spécifique.
 *
 * La règle "par défaut Maroc" : aîné plein tarif, cadets 10% de réduction.
 * Paramétrable par tenant via `tenant.settings.siblingDiscountPct`.
 */

export const DEFAULT_SIBLING_DISCOUNT_PCT = 10;

export type TenantEnrollmentSettings = {
  /** Pourcentage de réduction appliqué aux cadets (rang ≥ 2). */
  siblingDiscountPct?: number;
};

export function readSiblingDiscountPct(
  settings: unknown,
): number {
  if (!settings || typeof settings !== 'object') return DEFAULT_SIBLING_DISCOUNT_PCT;
  const s = settings as Record<string, unknown>;
  const v = s.siblingDiscountPct;
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100) return v;
  return DEFAULT_SIBLING_DISCOUNT_PCT;
}

/**
 * Détermine le pourcentage de réduction à appliquer à l'inscription d'un
 * élève donné, en fonction du nombre d'inscriptions ACTIVES déjà existantes
 * dans la même fratrie pour la même année.
 *
 * activeSiblingsAlreadyEnrolled = nombre de frères/sœurs déjà inscrits ACTIVE
 *   pour cette année AVANT celui-ci. Donc :
 *   - 0 → aîné (rang 1, sans réduction)
 *   - 1 → 2e enfant (rang 2, réduction)
 *   - 2 → 3e enfant (rang 3, réduction)
 *
 * Retourne le rang ET le pourcentage applicable.
 */
export function computeSiblingDiscount(
  activeSiblingsAlreadyEnrolled: number,
  tenantSiblingPct: number,
): { rank: number; pct: number } {
  const rank = Math.max(1, activeSiblingsAlreadyEnrolled + 1);
  const pct = rank >= 2 ? tenantSiblingPct : 0;
  return { rank, pct };
}

/**
 * Applique une réduction en % à un montant brut. Round 2 décimales.
 */
export function applyDiscount(amount: number, pct: number): number {
  if (!pct || pct <= 0) return roundMad(amount);
  return roundMad(amount * (1 - pct / 100));
}

function roundMad(n: number): number {
  return Math.round(n * 100) / 100;
}
