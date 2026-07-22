import { prismaAdmin } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';
import { pushToUsers } from '@/lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/mobile/push/test → envoie une notification de test aux appareils
 * enregistrés de l'utilisateur courant (pour vérifier le push de bout en bout).
 */
export async function POST(req: Request) {
  const principal = await verifyMobileToken(req);
  if (!principal) return Response.json({ error: 'Non authentifié.' }, { status: 401 });

  const devices = await prismaAdmin.deviceToken.count({
    where: { tenantId: principal.tenantId, userId: principal.userId },
  });
  await pushToUsers(principal.tenantId, [principal.userId], {
    title: 'LeadSchool',
    body: 'Notification de test ✅',
    data: { type: 'test' },
  });
  return Response.json({ ok: true, devices });
}
