import { auth } from '@/lib/auth';
import { withTenant, prismaAdmin } from '@/lib/db';
import { presignedGet } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/**
 * Sert le logo de l'établissement de la session (redirection vers une URL
 * signée MinIO). 404 si aucun logo → les portails affichent le logo par défaut.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const tenantId = session.user.tenantId;
  const tenant = await prismaAdmin.tenant.findUnique({
    where: { id: tenantId },
    select: { logoFileId: true },
  });
  if (!tenant?.logoFileId) return new Response('Aucun logo.', { status: 404 });

  const file = await withTenant(tenantId, (tx) =>
    tx.fileObject.findUnique({ where: { id: tenant.logoFileId! } }),
  );
  if (!file) return new Response('Aucun logo.', { status: 404 });

  const url = await presignedGet(file.s3Key, 15 * 60);
  return Response.redirect(url, 302);
}
