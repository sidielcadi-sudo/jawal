/**
 * Frais annuels : applicabilité conditionnelle + génération d'échéances.
 *
 * - Scolarité / Inscription / Garderie / Autre : toujours applicables.
 * - Transport : seulement si l'élève utilise le transport scolaire.
 * - Cantine : seulement si demi-pensionnaire ou interne.
 */
import { applyDiscount } from './enrollment-discount';

/** Aligné sur l'enum Prisma `FeeCategory`. */
export type FeeCategory =
  | 'TUITION'
  | 'INSCRIPTION'
  | 'TRANSPORT'
  | 'CANTEEN'
  | 'DAYCARE'
  | 'OTHER';
export type StudentRegime = 'EXTERNE' | 'DEMI_PENSIONNAIRE' | 'INTERNE' | null | undefined;

export type AnnualFee = {
  id: string;
  label: string;
  category: FeeCategory;
  totalAmount: number;
  installmentCount: number;
  installmentLocked: boolean;
  firstDueMonth: number;
};

export type StudentFeeContext = {
  usesTransport: boolean;
  regime: StudentRegime;
};

/** L'élève prend-il ses repas sur place (cantine) ? */
export function eatsAtCanteen(regime: StudentRegime): boolean {
  return regime === 'DEMI_PENSIONNAIRE' || regime === 'INTERNE';
}

/** Une catégorie de frais s'applique-t-elle à un élève donné ? */
export function feeCategoryApplies(category: FeeCategory, ctx: StudentFeeContext): boolean {
  switch (category) {
    case 'TRANSPORT':
      return ctx.usesTransport;
    case 'CANTEEN':
      return eatsAtCanteen(ctx.regime);
    default:
      // TUITION, INSCRIPTION, DAYCARE, OTHER : toujours applicables.
      return true;
  }
}

/** Filtre les frais annuels applicables à un élève (selon transport / régime). */
export function applicableAnnualFees<T extends { category: FeeCategory }>(
  fees: T[],
  ctx: StudentFeeContext,
): T[] {
  return fees.filter((f) => feeCategoryApplies(f.category, ctx));
}

export type InstallmentDraft = {
  feeScheduleItemId: string;
  label: string;
  amount: number;
  /** Date UTC (jour 5 du mois d'échéance). */
  dueDate: Date;
};

/**
 * Année scolaire de référence (mois) pour répartir les échéances.
 * 9 → permet : 9 échéances = mensuelles (pas 1), 3 = trimestrielles (pas 3),
 * 2 = semestrielles (Sept + Févr.), 1 = unique.
 */
const ACADEMIC_SPAN_MONTHS = 9;

/**
 * Écart (en mois) entre deux échéances consécutives, déduit de leur nombre :
 * - 9 échéances → 1 mois (chaque début de mois)
 * - 3 échéances → 3 mois (chaque début de trimestre)
 * - 2 échéances → ~5 mois (chaque début de semestre)
 * - 1 échéance  → unique
 */
export function installmentStepMonths(count: number): number {
  return Math.max(1, Math.round(ACADEMIC_SPAN_MONTHS / Math.max(1, count)));
}

/**
 * Construit les échéances d'un frais : montant réduit réparti sur `count`
 * versements, espacés selon `installmentStepMonths`, à partir de `firstDueMonth`.
 * Arrondi 2 décimales ; le dernier versement absorbe le reste d'arrondi.
 */
export function buildInstallments(
  fee: AnnualFee,
  opts: { pct: number; count: number; yearStart: Date },
): InstallmentDraft[] {
  const count = Math.max(1, Math.floor(opts.count));
  const step = installmentStepMonths(count);
  const discounted = applyDiscount(fee.totalAmount, opts.pct);
  const per = Math.round((discounted / count) * 100) / 100;
  const out: InstallmentDraft[] = [];
  for (let i = 0; i < count; i++) {
    const offset = (fee.firstDueMonth - 1) + i * step;
    const m = offset % 12;
    const yo = Math.floor(offset / 12);
    // Le dernier versement corrige l'arrondi pour retomber sur le total réduit.
    const amount = i === count - 1 ? Math.round((discounted - per * (count - 1)) * 100) / 100 : per;
    out.push({
      feeScheduleItemId: fee.id,
      label: `${fee.label} (${i + 1}/${count})`,
      amount,
      dueDate: new Date(Date.UTC(opts.yearStart.getUTCFullYear() + yo, m, 5)),
    });
  }
  return out;
}
