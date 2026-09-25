import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { presignedGet } from '@/lib/storage';

/** Affiche/télécharge une pièce déposée (redirection URL signée S3). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  const { docId } = await params;
  const tenantId = session.user.tenantId;

  const file = await withTenant(tenantId, async (tx) => {
    const doc = await tx.enrollmentDocument.findUnique({ where: { id: docId } });
    if (!doc?.fileId) return null;
    return tx.fileObject.findUnique({ where: { id: doc.fileId } });
  });
  if (!file) return new Response('Pièce introuvable.', { status: 404 });
  const url = await presignedGet(file.s3Key, 15 * 60);
  return Response.redirect(url, 302);
}
