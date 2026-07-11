'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { postBookSale } from '@/lib/accounting-hooks';

type Result = { ok: true } | { ok: false; error: string };

const METHODS = ['CASH', 'CHEQUE', 'TRANSFER', 'CMI'] as const;
type Method = (typeof METHODS)[number];

/** Commission école sur une vente, selon la config. */
function computeCommission(salePrice: number, mode: string, value: number): number {
  const c = mode === 'FIXED' ? value : (salePrice * value) / 100;
  return Math.min(salePrice, Math.round(Math.max(0, c) * 100) / 100);
}

/** Vend un exemplaire : statut SOLD, commission, crédit vendeur, mouvement de caisse. */
export async function sellCopyAction(copyId: string, method: string, buyerId?: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('students.write');
  if (!METHODS.includes(method as Method)) return { ok: false, error: 'Mode de paiement invalide.' };
  const tenantId = session.user.tenantId;

  try {
    await withTenant(tenantId, async (tx) => {
      const copy = await tx.bookCopy.findUnique({ where: { id: copyId }, select: { status: true, askPrice: true, campaignId: true } });
      if (!copy) throw new Error('Exemplaire introuvable.');
      if (copy.status !== 'FOR_SALE' && copy.status !== 'RESERVED') throw new Error('Cet exemplaire n’est pas en vente.');
      const config = await tx.bookExchangeConfig.findFirst({ select: { commissionMode: true, commissionValue: true } });
      const salePrice = copy.askPrice;
      const commission = config ? computeCommission(salePrice, config.commissionMode, config.commissionValue) : 0;

      await tx.bookCopy.update({
        where: { id: copyId },
        data: { status: 'SOLD', salePrice, commission, soldAt: new Date(), buyerId: buyerId || null },
      });
      const txn = await tx.bookTransaction.create({
        data: { tenantId, campaignId: copy.campaignId, copyId, type: 'SALE', amount: salePrice, method, recordedByUserId: session.user.id },
      });
      await postBookSale(tx, tenantId, txn.id, salePrice, commission, method, new Date(), session.user.id);
      await logAudit(tx, { tenantId, userId: session.user.id, action: 'sell_copy', entityType: 'BookCopy', entityId: copyId, after: { salePrice, commission, method } });
    });
    revalidatePath('/admin/bourse/vente');
    revalidatePath('/admin/bourse/depot');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
