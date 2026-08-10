/**
 * Teintes pastel claires des cartes d'indicateurs (tableau de bord, finance…).
 *
 * Le fond de la carte sert uniquement à **distinguer les indicateurs entre
 * eux** : il ne porte aucune information. L'état de santé d'un KPI (vert /
 * orange / rouge) reste porté par la pastille et par la couleur de la valeur,
 * pour qu'aucun signal ne soit perdu en passant au pastel.
 *
 * Les classes sont écrites en toutes lettres : Tailwind ne détecte pas les
 * noms de classes construits dynamiquement.
 */
export type KpiTone = { card: string; value: string };

export const KPI_TONES: KpiTone[] = [
  { card: 'border-sky-200 bg-sky-50', value: 'text-sky-900' },
  { card: 'border-emerald-200 bg-emerald-50', value: 'text-emerald-900' },
  { card: 'border-amber-200 bg-amber-50', value: 'text-amber-900' },
  { card: 'border-violet-200 bg-violet-50', value: 'text-violet-900' },
  { card: 'border-rose-200 bg-rose-50', value: 'text-rose-900' },
  { card: 'border-teal-200 bg-teal-50', value: 'text-teal-900' },
  { card: 'border-indigo-200 bg-indigo-50', value: 'text-indigo-900' },
  { card: 'border-fuchsia-200 bg-fuchsia-50', value: 'text-fuchsia-900' },
  { card: 'border-cyan-200 bg-cyan-50', value: 'text-cyan-900' },
  { card: 'border-lime-200 bg-lime-50', value: 'text-lime-900' },
  { card: 'border-orange-200 bg-orange-50', value: 'text-orange-900' },
  { card: 'border-slate-200 bg-slate-100', value: 'text-slate-900' },
];

/** Teinte d'une carte à partir de son rang dans la grille (cycle si besoin). */
export function kpiTone(index: number): KpiTone {
  return KPI_TONES[index % KPI_TONES.length]!;
}

/**
 * Déclinaisons de bleu, pour les indicateurs que l'on veut lire comme une
 * famille (Total dû / Encaissé / Élèves) plutôt que comme des cartes sans
 * rapport entre elles.
 */
export const BLUE_TONES: Record<'sky' | 'blue' | 'indigo' | 'cyan', KpiTone> = {
  sky: { card: 'border-sky-200 bg-sky-50', value: 'text-sky-900' },
  blue: { card: 'border-blue-200 bg-blue-50', value: 'text-blue-900' },
  indigo: { card: 'border-indigo-200 bg-indigo-50', value: 'text-indigo-900' },
  cyan: { card: 'border-cyan-200 bg-cyan-50', value: 'text-cyan-900' },
};
