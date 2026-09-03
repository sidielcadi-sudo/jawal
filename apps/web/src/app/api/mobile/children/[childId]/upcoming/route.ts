import { withTenant } from '@/lib/db';
import { verifyMobileParent } from '@/lib/mobile-auth';
import { loadParentChildContext } from '@/lib/parent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/mobile/children/[childId]/upcoming
 * → prochains contrôles/DS (évaluations datées à venir) de la classe de
 *   l'enfant, pour l'accueil de l'appli (section « Prochains DS »).
 */
export async function GET(req: Request, ctx: { params: Promise<{ childId: string }> }) {
  const { childId } = await ctx.params;
  const principal = await verifyMobileParent(req);
  if (!principal) return Response.json({ error: 'Non authentifié.' }, { status: 401 });

  const data = await withTenant(principal.tenantId, async (tx) => {
    const child = await loadParentChildContext(tx, principal.userId, childId);
    if (!child) return 'forbidden' as const;
    if (!child.classId) return { items: [] };

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const evals = await tx.evaluation.findMany({
      where: { classId: child.classId, date: { gte: today } },
      orderBy: { date: 'asc' },
      take: 10,
      select: {
        id: true,
        label: true,
        date: true,
        subject: { select: { label: true, labelAr: true } },
      },
    });

    return {
      items: evals.map((e) => ({
        id: e.id,
        subject: e.subject?.label ?? '—',
        label: e.label,
        date: e.date.toISOString().slice(0, 10),
      })),
    };
  });

  if (data === 'forbidden') return Response.json({ error: 'Accès refusé.' }, { status: 403 });
  return Response.json(data);
}
