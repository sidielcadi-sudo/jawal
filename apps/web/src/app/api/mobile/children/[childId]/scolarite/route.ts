import { withTenant } from '@/lib/db';
import { verifyMobileParent } from '@/lib/mobile-auth';
import { loadParentChildContext } from '@/lib/parent';
import { cmiConfigured } from '@/lib/cmi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/mobile/children/[childId]/scolarite
 * → échéancier de l'enfant (montant, reste dû, statut) + totaux + config paiement.
 */
export async function GET(req: Request, ctx: { params: Promise<{ childId: string }> }) {
  const { childId } = await ctx.params;
  const principal = await verifyMobileParent(req);
  if (!principal) return Response.json({ error: 'Non authentifié.' }, { status: 401 });

  const data = await withTenant(principal.tenantId, async (tx) => {
    const child = await loadParentChildContext(tx, principal.userId, childId);
    if (!child) return 'forbidden' as const;

    const installments = await tx.installment.findMany({
      where: { studentId: childId, status: { not: 'CANCELLED' } },
      include: { payments: { select: { amount: true } } },
      orderBy: { dueDate: 'asc' },
    });
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const fees = installments.map((i) => {
      const paid = i.payments.reduce((s, p) => s + Number(p.amount), 0);
      return {
        id: i.id,
        label: i.label,
        amount: round2(Number(i.amount)),
        remaining: round2(Math.max(0, Number(i.amount) - paid)),
        dueDate: i.dueDate,
        status: i.status as 'PENDING' | 'PARTIAL' | 'PAID',
      };
    });
    const totalDue = round2(fees.reduce((s, f) => s + f.amount, 0));
    const totalPaid = round2(fees.reduce((s, f) => s + (f.amount - f.remaining), 0));
    return {
      currency: 'MAD',
      paymentConfigured: cmiConfigured(),
      totalDue,
      totalPaid,
      totalRemaining: round2(Math.max(0, totalDue - totalPaid)),
      fees,
    };
  });

  if (data === 'forbidden') return Response.json({ error: 'Accès refusé.' }, { status: 403 });
  return Response.json(data);
}
