import { prismaAdmin } from '@/lib/db';
import { verifyMobileParent } from '@/lib/mobile-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/mobile/push/register  { token, platform } → enregistre le jeton
 * push Expo de l'appareil pour l'utilisateur courant (upsert par jeton).
 * DELETE  { token } → désenregistre (à la déconnexion).
 */
export async function POST(req: Request) {
  const principal = await verifyMobileParent(req);
  if (!principal) return Response.json({ error: 'Non authentifié.' }, { status: 401 });

  let body: { token?: string; platform?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }
  const token = body.token?.trim();
  if (!token) return Response.json({ error: 'Jeton manquant.' }, { status: 400 });
  const platform = body.platform === 'ios' || body.platform === 'android' ? body.platform : null;

  await prismaAdmin.deviceToken.upsert({
    where: { token },
    create: { tenantId: principal.tenantId, userId: principal.userId, token, platform },
    update: { tenantId: principal.tenantId, userId: principal.userId, platform },
  });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const principal = await verifyMobileParent(req);
  if (!principal) return Response.json({ error: 'Non authentifié.' }, { status: 401 });
  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }
  const token = body.token?.trim();
  if (token) {
    await prismaAdmin.deviceToken.deleteMany({ where: { token, userId: principal.userId } });
  }
  return Response.json({ ok: true });
}
