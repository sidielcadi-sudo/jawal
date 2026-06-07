import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { presignedGet } from '@/lib/storage';

/** Sert la photo d'une personne (redirection vers une URL signée MinIO). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { id: personId } = await params;
  const tenantId = session.user.tenantId;

  const file = await withTenant(tenantId, async (tx) => {
    const p = await tx.person.findUnique({ where: { id: personId } });
    if (!p?.photoFileId) return null;
    return tx.fileObject.findUnique({ where: { id: p.photoFileId } });
  });

  if (!file) return new Response('Aucune photo.', { status: 404 });
  const url = await presignedGet(file.s3Key, 15 * 60);
  return Response.redirect(url, 302);
}
