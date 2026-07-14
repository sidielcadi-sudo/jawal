/**
 * Calcul du remboursement d'un élève radié en cours d'année.
 * Deux bases sélectionnables par la comptabilité :
 *  - INSTALLMENT : frais consommés = paiements sur les échéances déjà échues.
 *  - PRORATA     : frais consommés = montant × (temps écoulé / durée de service),
 *                  la période de service allant de la rentrée (sept.) à fin juin
 *                  (juillet/août = hors service → année terminée, prorata = 100 %).
 * La remboursabilité est configurable par catégorie de frais (settings tenant).
 */
import type { Prisma } from '@jawal/db';

export const REFUND_CATEGORIES = ['TUITION', 'INSCRIPTION', 'TRANSPORT', 'CANTEEN', 'DAYCARE', 'OTHER'] as const;
export type RefundCategory = (typeof REFUND_CATEGORIES)[number];
export type RefundBasis = 'INSTALLMENT' | 'PRORATA';

export type RefundItem = { category: RefundCategory; amount: number; dueDate: Date; paid: number };
export type RefundLine = {
  category: RefundCategory;
  paid: number;
  consumed: number;
  refundable: number;
  /** Reste dû par le parent sur cette catégorie (montant total − versé). */
  due: number;
  /** Catégorie remboursable (selon la config) → affiche R / NR. */
  isRefundable: boolean;
};
export type RefundComputation = {
  basis: RefundBasis;
  lines: RefundLine[];
  paidTotal: number;
  consumedTotal: number;
  computedAmount: number;
  /** Total restant dû par le parent (toutes catégories). */
  dueTotal: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Remboursabilité par catégorie depuis `tenant.settings.refundableCategories`.
 * Défaut : toutes remboursables (l'établissement décoche l'inscription au besoin).
 */
export function refundableMap(settings: unknown): Record<RefundCategory, boolean> {
  const cfg = (settings as { refundableCategories?: Record<string, boolean> } | null)?.refundableCategories;
  const map = {} as Record<RefundCategory, boolean>;
  // Défaut : tout remboursable, sauf les frais d'inscription (non remboursables
  // par usage) — l'établissement peut inverser chaque catégorie.
  for (const c of REFUND_CATEGORIES) map[c] = cfg?.[c] ?? c !== 'INSCRIPTION';
  return map;
}

/** Charge les échéances (avec paiements) de l'élève pour l'année, groupables par catégorie. */
export async function loadRefundItems(
  tx: Prisma.TransactionClient,
  studentId: string,
  academicYearId: string,
): Promise<RefundItem[]> {
  const fees = await tx.feeScheduleItem.findMany({
    where: { academicYearId },
    select: { id: true, category: true },
  });
  const catById = new Map(fees.map((f) => [f.id, f.category as RefundCategory]));
  const feeIds = fees.map((f) => f.id);
  if (feeIds.length === 0) return [];
  const insts = await tx.installment.findMany({
    where: { studentId, status: { not: 'CANCELLED' }, feeScheduleItemId: { in: feeIds } },
    include: { payments: { select: { amount: true } } },
  });
  return insts.map((i) => ({
    category: (i.feeScheduleItemId ? catById.get(i.feeScheduleItemId) : 'OTHER') ?? 'OTHER',
    amount: Number(i.amount),
    dueDate: i.dueDate,
    paid: i.payments.reduce((s, p) => s + Number(p.amount), 0),
  }));
}

/** Total payé (toutes catégories) — sert à détecter un remboursement potentiel. */
export function paidSum(items: RefundItem[]): number {
  return r2(items.reduce((s, i) => s + i.paid, 0));
}

/** Calcule le remboursement selon la base et la config de remboursabilité. */
export function computeRefund(
  items: RefundItem[],
  opts: {
    basis: RefundBasis;
    refundable: Record<RefundCategory, boolean>;
    now: Date;
    yearStart: Date;
    yearEnd: Date;
  },
): RefundComputation {
  // Période de **service** = rentrée (septembre) → fin juin. Juillet/août ne sont
  // pas des mois de service : au-delà de fin juin, l'année est considérée
  // terminée (prorata plafonné à 100 % → plus rien à rembourser au temporel).
  // On plafonne donc la fin de période au 30 juin (borné par la fin d'année si
  // celle-ci est déjà antérieure).
  const juneEnd = new Date(Date.UTC(opts.yearEnd.getUTCFullYear(), 5, 30, 23, 59, 59, 999));
  const serviceEnd = opts.yearEnd.getTime() < juneEnd.getTime() ? opts.yearEnd : juneEnd;
  const totalMs = Math.max(1, serviceEnd.getTime() - opts.yearStart.getTime());
  const elapsedMs = Math.min(totalMs, Math.max(0, opts.now.getTime() - opts.yearStart.getTime()));
  const consumedFraction = elapsedMs / totalMs; // part de la période de service déjà écoulée

  // On accumule par catégorie le versé et le **coût consommé** (basé sur le
  // montant DÛ, pas sur le versé), puis on nette : remboursable = versé − coût,
  // borné à ≥ 0. Ainsi un reliquat impayé réduit d'autant le remboursement.
  const acc = new Map<RefundCategory, { paid: number; cost: number; amount: number }>();
  for (const c of REFUND_CATEGORIES) acc.set(c, { paid: 0, cost: 0, amount: 0 });

  for (const it of items) {
    const a = acc.get(it.category)!;
    a.paid = r2(a.paid + it.paid);
    a.amount = r2(a.amount + it.amount); // montant total facturé (pour le reste dû)
    if (!opts.refundable[it.category]) continue; // non remboursable : cost non pertinent
    // Coût du service pour la période fréquentée, sur le montant total du frais.
    const cost =
      opts.basis === 'INSTALLMENT'
        ? it.dueDate.getTime() <= opts.now.getTime()
          ? it.amount
          : 0
        : r2(it.amount * consumedFraction);
    a.cost = r2(a.cost + cost);
  }

  const byCat = new Map<RefundCategory, RefundLine>();
  for (const c of REFUND_CATEGORIES) {
    const a = acc.get(c)!;
    const refundable = opts.refundable[c] ? Math.max(0, r2(a.paid - a.cost)) : 0;
    byCat.set(c, {
      category: c,
      paid: a.paid,
      consumed: r2(a.paid - refundable),
      refundable,
      due: Math.max(0, r2(a.amount - a.paid)), // reste dû par le parent
      isRefundable: opts.refundable[c],
    });
  }

  const lines = REFUND_CATEGORIES.map((c) => byCat.get(c)!).filter((l) => l.paid > 0 || l.due > 0);
  const paidTotal = r2(lines.reduce((s, l) => s + l.paid, 0));
  const computedAmount = r2(lines.reduce((s, l) => s + l.refundable, 0));
  const consumedTotal = r2(paidTotal - computedAmount);
  const dueTotal = r2(lines.reduce((s, l) => s + l.due, 0));
  return { basis: opts.basis, lines, paidTotal, consumedTotal, computedAmount, dueTotal };
}
