/**
 * Lecture d'un dossier parent : joignabilité, portail, situation financière.
 *
 * La liste des parents ne disait rien de ce qu'on vient y chercher — peut-on
 * joindre cette famille, a-t-elle accès au portail, doit-elle de l'argent. Ces
 * règles produisent ces trois réponses, et se vérifient sans base.
 */

export type ParentContacts = { phone?: string; email?: string; whatsapp?: string };

/** Une famille est joignable dès qu'un numéro permet de l'appeler. */
export function isReachable(c: ParentContacts | null | undefined): boolean {
  const has = (v?: string) => typeof v === 'string' && v.trim() !== '';
  return has(c?.phone) || has(c?.whatsapp);
}

/** Ce qu'il manque à la fiche de contact, pour le dire à l'écran. */
export function missingContacts(c: ParentContacts | null | undefined): string[] {
  const has = (v?: string) => typeof v === 'string' && v.trim() !== '';
  const missing: string[] = [];
  if (!has(c?.phone) && !has(c?.whatsapp)) missing.push('Téléphone');
  if (!has(c?.email)) missing.push('E-mail');
  return missing;
}

/* ── Situation financière de la famille ──────────────────────────────────── */

export type FamilyInstallment = {
  amount: number;
  paid: number;
  dueDate: Date;
};

export type FinancialStatus = {
  state: 'UP_TO_DATE' | 'LATE' | 'NO_FEES';
  /** Nombre d'échéances échues et non soldées. */
  overdueCount: number;
  /** Montant restant sur ces échéances. */
  overdueAmount: number;
};

/**
 * Situation d'une famille au regard des frais.
 *
 * Seules les échéances **déjà tombées** comptent : une échéance de juin non
 * payée en septembre n'est pas un retard, et la compter comme tel mettrait
 * toutes les familles en rouge dès la rentrée.
 *
 * Le seuil d'un centime absorbe les arrondis : un reliquat de 0,004 MAD après
 * un paiement fractionné n'est pas une dette.
 */
export function familyFinancialStatus(
  installments: FamilyInstallment[],
  now: Date = new Date(),
): FinancialStatus {
  if (installments.length === 0) {
    return { state: 'NO_FEES', overdueCount: 0, overdueAmount: 0 };
  }
  let overdueCount = 0;
  let overdueAmount = 0;
  for (const i of installments) {
    if (i.dueDate > now) continue;
    const remaining = i.amount - i.paid;
    if (remaining > 0.01) {
      overdueCount++;
      overdueAmount += remaining;
    }
  }
  return {
    state: overdueCount > 0 ? 'LATE' : 'UP_TO_DATE',
    overdueCount,
    overdueAmount: Math.round(overdueAmount * 100) / 100,
  };
}

/** Libellé court pour la colonne « Statut financier ». */
export function financialLabel(s: FinancialStatus): string {
  if (s.state === 'NO_FEES') return 'Aucun frais';
  if (s.state === 'UP_TO_DATE') return 'À jour';
  return s.overdueCount === 1 ? 'Retard (1 éch.)' : `Retard (${s.overdueCount} éch.)`;
}

/* ── Indicateurs de tête ─────────────────────────────────────────────────── */

export type FamilyRow = {
  hasPortal: boolean;
  reachable: boolean;
  financial: FinancialStatus['state'];
};

export type ParentKpis = {
  families: number;
  withPortal: number;
  portalRate: number | null;
  reachable: number;
  toComplete: number;
  contactRate: number | null;
  upToDate: number;
  lateFamilies: number;
  settlementRate: number | null;
};

/**
 * Consolide les familles en indicateurs.
 *
 * Le dénominateur est partout le même — les familles rattachées à au moins un
 * élève inscrit — pour que les trois taux se comparent entre eux. Les familles
 * sans frais ne comptent ni comme à jour ni comme en retard : elles sortent du
 * taux de règlement plutôt que de le gonfler.
 */
export function parentKpis(rows: FamilyRow[]): ParentKpis {
  const families = rows.length;
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

  const withPortal = rows.filter((r) => r.hasPortal).length;
  const reachable = rows.filter((r) => r.reachable).length;
  const upToDate = rows.filter((r) => r.financial === 'UP_TO_DATE').length;
  const lateFamilies = rows.filter((r) => r.financial === 'LATE').length;
  const billed = upToDate + lateFamilies;

  return {
    families,
    withPortal,
    portalRate: pct(withPortal, families),
    reachable,
    toComplete: families - reachable,
    contactRate: pct(reachable, families),
    upToDate,
    lateFamilies,
    settlementRate: pct(upToDate, billed),
  };
}
