'use server';

import { auth } from '@/lib/auth';
import { prismaAdmin, withTenant } from '@/lib/db';
import { parentCanAccessChild } from '@/lib/parent';
import { buildCmiRequest, cmiConfigured } from '@/lib/cmi';

type InitResult =
  | { ok: true; action: string; fields: Record<string, string> }
  | { ok: false; error: string; notConfigured?: boolean };

/**
 * Initie un paiement en ligne CMI pour un ou plusieurs reliquats d'échéances de
 * l'enfant. Crée une commande `OnlinePayment` (montant = reste dû, autoritaire)
 * et renvoie le formulaire signé à POSTer vers CMI. Le règlement effectif n'est
 * enregistré qu'au **callback** vérifié (jamais côté client).
 */
export async function initiateCmiPaymentAction(
  childId: string,
  installmentIds: string[],
): Promise<InitResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  if (!cmiConfigured()) return { ok: false, error: 'Paiement en ligne non configuré.', notConfigured: true };
  if (!Array.isArray(installmentIds) || installmentIds.length === 0) return { ok: false, error: 'Aucune échéance sélectionnée.' };

  const tenantId = session.user.tenantId;
  try {
    // Contrôle d'accès + reliquats, sous RLS.
    const valid = await withTenant(tenantId, async (tx) => {
      if (!(await parentCanAccessChild(tx, session.user.id, childId))) return null;
      const insts = await tx.installment.findMany({
        where: { id: { in: installmentIds }, studentId: childId, status: { in: ['PENDING', 'PARTIAL'] } },
        include: { payments: { select: { amount: true } } },
      });
      return insts.map((i) => ({
        id: i.id,
        remaining: Math.max(0, Number(i.amount) - i.payments.reduce((s, p) => s + Number(p.amount), 0)),
      }));
    });
    if (!valid) return { ok: false, error: 'Accès refusé.' };
    const payable = valid.filter((i) => i.remaining > 0);
    if (payable.length === 0) return { ok: false, error: 'Aucune échéance à payer.' };
    const amount = Math.round(payable.reduce((s, i) => s + i.remaining, 0) * 100) / 100;
    if (amount <= 0) return { ok: false, error: 'Montant nul.' };

    // Commande (prismaAdmin : superuser, tenant scopé explicitement).
    const order = await prismaAdmin.onlinePayment.create({
      data: {
        tenantId,
        studentId: childId,
        installmentIds: payable.map((i) => i.id),
        amount,
        currency: 'MAD',
        provider: 'CMI',
        status: 'PENDING',
        createdByUserId: session.user.id,
      },
      select: { id: true },
    });

    const base = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
    const req = buildCmiRequest({
      oid: order.id,
      amount,
      currency: 'MAD',
      okUrl: `${base}/api/payments/cmi/return`,
      failUrl: `${base}/api/payments/cmi/return`,
      callbackUrl: `${base}/api/payments/cmi/callback`,
      lang: 'fr',
      email: session.user.email,
    });
    return { ok: true, action: req.action, fields: req.fields };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
