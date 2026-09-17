'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';

/**
 * Passe des échéances échues en contentieux, ou les en retire.
 *
 * Le contentieux ne change ni le montant ni le statut de paiement : il marque
 * une créance dont le recouvrement a quitté la relance ordinaire (mise en
 * demeure, avocat, huissier). Un règlement ultérieur reste possible.
 */
export async function setContentiousAction(
  installmentIds: string[],
  on: boolean,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('finance.write');
  if (installmentIds.length === 0) return { ok: false, error: 'Aucune échéance échue à traiter.' };
  const tenantId = session.user.tenantId;
  try {
    const count = await withTenant(tenantId, async (tx) => {
      const res = await tx.installment.updateMany({
        where: { id: { in: installmentIds }, status: { not: 'CANCELLED' }, dueDate: { lte: new Date() } },
        data: on ? { contentiousAt: new Date() } : { contentiousAt: null, contentiousNote: null },
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: on ? 'contentious_on' : 'contentious_off',
        entityType: 'Installment',
        entityId: installmentIds[0]!,
        after: { count: res.count, installmentIds },
      });
      return res.count;
    });
    revalidatePath('/admin/finance/unpaid');
    return { ok: true, count };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
