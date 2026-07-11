import { prismaAdmin, withTenant } from '@/lib/db';
import { verifyCmiCallback } from '@/lib/cmi';
import { postInstallmentPayment } from '@/lib/accounting-hooks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Callback serveur-à-serveur CMI (POST). Source de vérité du règlement :
 * vérifie la signature ver3, puis — si approuvé — enregistre un paiement (CMI)
 * pour chaque échéance de la commande + écriture comptable, de façon idempotente.
 * La réponse `ACTION=POSTAUTH` déclenche la capture côté CMI (modèle PreAuth).
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) params[k] = typeof v === 'string' ? v : '';

  const res = verifyCmiCallback(params);
  if (!res.oid) return new Response('FAILURE', { status: 200 });

  const order = await prismaAdmin.onlinePayment.findUnique({ where: { id: res.oid } });
  if (!order) return new Response('FAILURE', { status: 200 });
  if (order.status === 'PAID') return new Response('ACTION=POSTAUTH', { status: 200 }); // idempotent

  // Signature invalide → on ne touche à rien (anti-fraude).
  if (!res.valid) return new Response('FAILURE', { status: 200 });

  if (!res.approved) {
    await prismaAdmin.onlinePayment.update({
      where: { id: order.id },
      data: { status: 'FAILED', providerRef: res.transId, rawResult: params },
    });
    return new Response('APPROVED', { status: 200 });
  }

  // Approuvé : enregistrer les paiements dans le contexte tenant (RLS + compta).
  await withTenant(order.tenantId, async (tx) => {
    for (const instId of order.installmentIds) {
      const inst = await tx.installment.findUnique({
        where: { id: instId },
        include: { payments: { select: { amount: true } } },
      });
      if (!inst || inst.status === 'CANCELLED' || inst.status === 'PAID') continue;
      const already = inst.payments.reduce((s, p) => s + Number(p.amount), 0);
      const remaining = Math.round((Number(inst.amount) - already) * 100) / 100;
      if (remaining <= 0) continue;
      const pay = await tx.payment.create({
        data: {
          tenantId: order.tenantId,
          installmentId: instId,
          amount: remaining,
          method: 'CMI',
          reference: res.transId ?? order.id,
          paidAt: new Date(),
          recordedByUserId: order.createdByUserId,
        },
      });
      await postInstallmentPayment(
        tx,
        order.tenantId,
        instId,
        { id: pay.id, amount: remaining, method: 'CMI' },
        new Date(),
        order.createdByUserId ?? undefined,
      );
      await tx.installment.update({ where: { id: instId }, data: { status: 'PAID' } });
    }
  });

  await prismaAdmin.onlinePayment.update({
    where: { id: order.id },
    data: { status: 'PAID', paidAt: new Date(), providerRef: res.transId, rawResult: params },
  });

  return new Response('ACTION=POSTAUTH', { status: 200 });
}
