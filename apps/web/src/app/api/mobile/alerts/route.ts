import { withTenant } from '@/lib/db';
import { verifyMobileUser } from '@/lib/mobile-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/mobile/alerts
 * → alertes in-app du compte (`StaffAlert`) + nombre de non-lues. Même source
 *   que la cloche de l'en-tête des portails web, et servie aux deux espaces
 *   mobiles : les alertes sont rattachées à un utilisateur, pas à un rôle.
 */
export async function GET(req: Request) {
  const principal = await verifyMobileUser(req);
  if (!principal) return Response.json({ error: 'Non authentifié.' }, { status: 401 });

  const data = await withTenant(principal.tenantId, async (tx) => {
    const [rows, unread] = await Promise.all([
      tx.staffAlert.findMany({
        where: { userId: principal.userId },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      tx.staffAlert.count({ where: { userId: principal.userId, readAt: null } }),
    ]);
    return {
      unread,
      items: rows.map((a) => ({
        id: a.id,
        type: a.type,
        title: a.title,
        body: a.body,
        read: a.readAt !== null,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  });

  return Response.json(data);
}

/**
 * POST /api/mobile/alerts  { id? }
 * → marque une alerte comme lue, ou toutes si `id` est absent. Restreint aux
 *   alertes du compte courant.
 */
export async function POST(req: Request) {
  const principal = await verifyMobileUser(req);
  if (!principal) return Response.json({ error: 'Non authentifié.' }, { status: 401 });

  let body: { id?: string } = {};
  try {
    body = (await req.json()) as { id?: string };
  } catch {
    body = {};
  }

  await withTenant(principal.tenantId, async (tx) => {
    await tx.staffAlert.updateMany({
      where: {
        userId: principal.userId,
        readAt: null,
        ...(body.id ? { id: body.id } : {}),
      },
      data: { readAt: new Date() },
    });
  });

  return Response.json({ ok: true });
}
