import { withTenant } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';
import { getParentChildren, getParentAnnouncements } from '@/lib/parent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/mobile/announcements → annonces visibles par le parent. */
export async function GET(req: Request) {
  const principal = await verifyMobileToken(req);
  if (!principal) return Response.json({ error: 'Non authentifié.' }, { status: 401 });

  const items = await withTenant(principal.tenantId, async (tx) => {
    const children = await getParentChildren(tx, principal.userId);
    const anns = await getParentAnnouncements(tx, children);
    return anns.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      publishedAt: a.publishedAt,
      audience: a.audience,
    }));
  });

  return Response.json({ items });
}
