import { prismaAdmin, withTenant } from '@/lib/db';
import { verifyMobileParent } from '@/lib/mobile-auth';
import { parentCanAccessChild } from '@/lib/parent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/mobile/payments/[orderId] → statut d'une commande de paiement, pour
 * que l'app interroge après le retour du WebView (le règlement est fait par le
 * callback signé, éventuellement avec un léger délai).
 */
export async function GET(req: Request, ctx: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await ctx.params;
  const principal = await verifyMobileParent(req);
  if (!principal) return Response.json({ error: 'Non authentifié.' }, { status: 401 });

  const order = await prismaAdmin.onlinePayment.findUnique({
    where: { id: orderId },
    select: { tenantId: true, studentId: true, status: true, amount: true, paidAt: true },
  });
  if (!order || order.tenantId !== principal.tenantId)
    return Response.json({ error: 'Commande introuvable.' }, { status: 404 });

  // Le parent doit pouvoir accéder à l'élève de la commande.
  const allowed = await withTenant(principal.tenantId, (tx) =>
    parentCanAccessChild(tx, principal.userId, order.studentId),
  );
  if (!allowed) return Response.json({ error: 'Accès refusé.' }, { status: 403 });

  return Response.json({
    status: order.status,
    amount: Number(order.amount),
    paidAt: order.paidAt,
  });
}
