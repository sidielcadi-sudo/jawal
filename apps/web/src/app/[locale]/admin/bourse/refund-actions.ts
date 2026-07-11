'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { postBookRefund } from '@/lib/accounting-hooks';

type Result = { ok: true; message?: string } | { ok: false; error: string };

async function guard() {
  const session = await auth();
  if (!session?.user) return null;
  await requirePermission('students.write');
  return session;
}

/**
 * Rembourse un vendeur pour tous ses exemplaires vendus non encore remboursés
 * d'une campagne. Montant = Σ(prix vente − commission). Mode CASH (caisse) ou
 * FEE_CREDIT (avoir défalqué sur une échéance à venir de l'élève).
 */
export async function refundSellerAction(
  sellerId: string,
  campaignId: string,
  mode: 'CASH' | 'FEE_CREDIT',
  installmentId?: string,
): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const tenantId = s.user.tenantId;
  try {
    return await withTenant(tenantId, async (tx): Promise<Result> => {
      const copies = await tx.bookCopy.findMany({
        where: { sellerId, campaignId, status: 'SOLD' },
        select: { id: true, salePrice: true, commission: true },
      });
      if (copies.length === 0) return { ok: false, error: 'Rien à rembourser.' };
      const total = Math.round(copies.reduce((sum, c) => sum + ((c.salePrice ?? 0) - (c.commission ?? 0)), 0) * 100) / 100;
      if (total <= 0) return { ok: false, error: 'Montant nul.' };

      if (mode === 'FEE_CREDIT') {
        if (!installmentId) return { ok: false, error: 'Choisir une échéance à créditer.' };
        const inst = await tx.installment.findUnique({ where: { id: installmentId }, include: { payments: { select: { amount: true } } } });
        if (!inst) return { ok: false, error: 'Échéance introuvable.' };
        await tx.payment.create({
          data: { tenantId, installmentId, amount: total, method: 'OTHER', reference: 'Avoir bourse aux livres', recordedByUserId: s.user.id },
        });
        const paid = inst.payments.reduce((x, p) => x + Number(p.amount), 0) + total;
        if (paid >= Number(inst.amount)) await tx.installment.update({ where: { id: installmentId }, data: { status: 'PAID' } });
        else await tx.installment.update({ where: { id: installmentId }, data: { status: 'PARTIAL' } });
      }

      await tx.bookCopy.updateMany({ where: { id: { in: copies.map((c) => c.id) } }, data: { status: 'REFUNDED', refundedAt: new Date(), refundMode: mode } });
      // Un mouvement de remboursement par exemplaire (pour le journal).
      for (const c of copies) {
        const net = Math.round(((c.salePrice ?? 0) - (c.commission ?? 0)) * 100) / 100;
        const txn = await tx.bookTransaction.create({
          data: { tenantId, campaignId, copyId: c.id, type: 'REFUND', amount: net, method: mode === 'CASH' ? 'CASH' : 'CREDIT', recordedByUserId: s.user.id },
        });
        await postBookRefund(tx, tenantId, txn.id, net, mode === 'CASH' ? 'CASH' : 'CREDIT', new Date(), s.user.id);
      }
      await logAudit(tx, { tenantId, userId: s.user.id, action: 'refund_seller', entityType: 'Person', entityId: sellerId, after: { total, mode, count: copies.length } });
      revalidatePath('/admin/bourse/remboursements');
      revalidatePath('/admin/finance');
      return { ok: true, message: `${total} remboursé(s) — ${copies.length} livre(s).` };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/** Retire un invendu (parent récupère) : code → statut WITHDRAWN. */
export async function withdrawByCodeAction(campaignId: string, code: string): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const tenantId = s.user.tenantId;
  try {
    return await withTenant(tenantId, async (tx): Promise<Result> => {
      const copy = await tx.bookCopy.findFirst({ where: { campaignId, code: code.trim() }, select: { id: true, status: true } });
      if (!copy) return { ok: false, error: 'Code introuvable dans cette campagne.' };
      if (copy.status !== 'FOR_SALE') return { ok: false, error: 'Cet exemplaire n’est pas disponible au retrait.' };
      await tx.bookCopy.update({ where: { id: copy.id }, data: { status: 'WITHDRAWN' } });
      await logAudit(tx, { tenantId, userId: s.user.id, action: 'withdraw_copy', entityType: 'BookCopy', entityId: copy.id });
      revalidatePath('/admin/bourse/remboursements');
      return { ok: true, message: 'Exemplaire retiré.' };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
