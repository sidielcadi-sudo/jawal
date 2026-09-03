import { withTenant } from '@/lib/db';
import { verifyMobileParent } from '@/lib/mobile-auth';
import { loadParentChildContext } from '@/lib/parent';
import { loadStudentCarnet } from '@/lib/carnet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/mobile/children/[childId]/vie-scolaire
 * → carnet de vie scolaire (absences, retards, incidents) côté parent.
 */
export async function GET(req: Request, ctx: { params: Promise<{ childId: string }> }) {
  const { childId } = await ctx.params;
  const principal = await verifyMobileParent(req);
  if (!principal) return Response.json({ error: 'Non authentifié.' }, { status: 401 });

  const data = await withTenant(principal.tenantId, async (tx) => {
    const child = await loadParentChildContext(tx, principal.userId, childId);
    if (!child) return 'forbidden' as const;
    const carnet = await loadStudentCarnet(tx, childId, { forParents: true });
    return { carnet };
  });

  if (data === 'forbidden') return Response.json({ error: 'Accès refusé.' }, { status: 403 });
  return Response.json(data);
}
