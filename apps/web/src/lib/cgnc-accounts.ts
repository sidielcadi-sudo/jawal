/**
 * Plan comptable CGNC par défaut (sous-ensemble adapté aux écoles privées
 * marocaines). Entièrement modifiable par l'établissement après seed.
 * `r` = compte de tiers lettrable (clients / fournisseurs).
 */
export type SeedAccount = { code: string; name: string; r?: boolean };

export const DEFAULT_CHART: SeedAccount[] = [
  // Classe 1 — Financement permanent
  { code: '1111', name: 'Capital / Fonds de dotation' },
  { code: '1191', name: 'Résultat net de l’exercice' },
  // Classe 3 — Créances de l'actif circulant (clients)
  { code: '3421', name: 'Clients', r: true },
  { code: '34211', name: 'Clients — Scolarité', r: true },
  { code: '34212', name: 'Clients — Transport', r: true },
  { code: '34213', name: 'Clients — Cantine', r: true },
  // Classe 4 — Dettes du passif circulant
  { code: '4411', name: 'Fournisseurs', r: true },
  { code: '4432', name: 'Rémunérations dues au personnel' },
  { code: '4441', name: 'CNSS' },
  { code: '4443', name: 'Caisses de retraite (CIMR)' },
  { code: '4445', name: 'Mutuelles (AMO)' },
  { code: '4452', name: 'État — Impôt sur le revenu (IR)' },
  { code: '4455', name: 'État — TVA facturée' },
  { code: '4468', name: 'Autres créanciers (dépôt-vente bourse)' },
  // Classe 5 — Trésorerie
  { code: '5141', name: 'Banque' },
  { code: '5161', name: 'Caisse' },
  // Classe 6 — Charges
  { code: '6125', name: 'Achats non stockés (eau, électricité, fournitures)' },
  { code: '6131', name: 'Locations et charges locatives' },
  { code: '6133', name: 'Entretien et réparations' },
  { code: '6141', name: 'Études, prestations et services extérieurs' },
  { code: '6145', name: 'Frais de transport' },
  { code: '6167', name: 'Impôts et taxes' },
  { code: '6171', name: 'Rémunérations du personnel' },
  { code: '6174', name: 'Charges sociales' },
  { code: '6585', name: 'Créances devenues irrécouvrables' },
  // Classe 7 — Produits
  { code: '7111', name: 'Produits — Scolarité' },
  { code: '7112', name: 'Produits — Transport' },
  { code: '7113', name: 'Produits — Cantine' },
  { code: '7118', name: 'Produits — Activités et sorties' },
  { code: '7119', name: 'Remises et créances annulées accordées' },
  { code: '7127', name: 'Ventes (manuels, uniformes)' },
  { code: '7588', name: 'Produits divers (commission bourse…)' },
];

/** Classe CGNC (1er chiffre du code) → utilisée pour bilan (1–5) / CPC (6–7). */
export function accountClass(code: string): number {
  return Number(code[0]) || 0;
}
