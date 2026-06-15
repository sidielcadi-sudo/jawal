/**
 * Calcul de moyenne pondérée sur /20 avec devoirs facultatifs (façon Pronote).
 *
 * - Devoir normal : compte dans la moyenne pondérée.
 * - Facultatif BONUS : les points au-dessus de 10/20 s'ajoutent directement à la
 *   moyenne (jamais de pénalité), plafonné à 20.
 * - Facultatif NOTE : la note n'est incluse que si elle améliore la moyenne des
 *   devoirs obligatoires (seuil = moyenne obligatoire).
 *
 * Helper pur (utilisable côté client comme serveur).
 */
export type AverageItem = {
  /** Note normalisée sur 20 (value / maxValue * 20). */
  n20: number;
  weight: number;
  optional: boolean;
  mode: 'BONUS' | 'NOTE';
};

export function computeAverage20(items: AverageItem[]): number | null {
  const mandatory = items.filter((i) => !i.optional);
  const optNote = items.filter((i) => i.optional && i.mode === 'NOTE');
  const optBonus = items.filter((i) => i.optional && i.mode === 'BONUS');

  let sum = 0;
  let w = 0;
  for (const i of mandatory) {
    sum += i.n20 * i.weight;
    w += i.weight;
  }
  const base = w > 0 ? sum / w : null;

  // Facultatif NOTE : inclus seulement s'il dépasse la moyenne obligatoire
  // (ou s'il n'y a pas encore de base).
  for (const i of optNote) {
    if (base === null || i.n20 > base) {
      sum += i.n20 * i.weight;
      w += i.weight;
    }
  }
  let avg = w > 0 ? sum / w : null;

  // Facultatif BONUS : ajoute les points au-dessus de 10.
  if (avg !== null && optBonus.length > 0) {
    let bonus = 0;
    for (const i of optBonus) bonus += Math.max(0, i.n20 - 10);
    avg = Math.min(20, avg + bonus);
  }

  return avg;
}
