import { prismaAdmin, withTenant } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';
import { parentCanAccessChild } from '@/lib/parent';
import { buildCmiRequest, cmiConfigured } from '@/lib/cmi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/mobile/children/[childId]/pay  { installmentIds: string[] }
 * → crée une commande OnlinePayment (montant = reste dû, autoritaire côté serveur)
 * et renvoie le formulaire CMI signé à POSTer depuis un WebView. Le règlement
 * n'est enregistré qu'au callback signé (jamais côté client).
 */
export async function POST(req: Request, ctx: { params: Promise<{ childId: string }> }) {
  const { childId } = await ctx.params;
  const principal = await verifyMobileToken(req);
  if (!principal) return Response.json({ error: 'Non authentifié.' }, { status: 401 });
  if (!cmiConfigured())
    return Response.json({ error: 'Paiement en ligne non configuré.', notConfigured: true }, { status: 503 });

  let payload: { installmentIds?: unknown };
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }
  const installmentIds = Array.isArray(payload.installmentIds)
    ? payload.installmentIds.filter((v): v is string => typeof v === 'string')
    : [];
  if (installmentIds.length === 0) return Response.json({ error: 'Aucune échéance sélectionnée.' }, { status: 400 });

  const valid = await withTenant(principal.tenantId, async (tx) => {
    if (!(await parentCanAccessChild(tx, principal.userId, childId))) return null;
    const insts = await tx.installment.findMany({
      where: { id: { in: installmentIds }, studentId: childId, status: { in: ['PENDING', 'PARTIAL'] } },
      include: { payments: { select: { amount: true } } },
    });
    return insts.map((i) => ({
      id: i.id,
      remaining: Math.max(0, Number(i.amount) - i.payments.reduce((s, p) => s + Number(p.amount), 0)),
    }));
  });
  if (!valid) return Response.json({ error: 'Accès refusé.' }, { status: 403 });

  const payable = valid.filter((i) => i.remaining > 0);
  if (payable.length === 0) return Response.json({ error: 'Aucune échéance à payer.' }, { status: 400 });
  const amount = Math.round(payable.reduce((s, i) => s + i.remaining, 0) * 100) / 100;
  if (amount <= 0) return Response.json({ error: 'Montant nul.' }, { status: 400 });

  const order = await prismaAdmin.onlinePayment.create({
    data: {
      tenantId: principal.tenantId,
      studentId: childId,
      installmentIds: payable.map((i) => i.id),
      amount,
      currency: 'MAD',
      provider: 'CMI',
      status: 'PENDING',
      createdByUserId: principal.userId,
    },
    select: { id: true },
  });

  const base = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const cmi = buildCmiRequest({
    oid: order.id,
    amount,
    currency: 'MAD',
    okUrl: `${base}/api/payments/cmi/return`,
    failUrl: `${base}/api/payments/cmi/return`,
    callbackUrl: `${base}/api/payments/cmi/callback`,
    lang: 'fr',
  });

  return Response.json({ orderId: order.id, amount, action: cmi.action, fields: cmi.fields });
}
