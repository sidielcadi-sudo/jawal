import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { presignedGet } from '@/lib/storage';

const KINDS = new Set(['cinScan', 'cnssAttestation']);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  const { id: personId, kind } = await params;
  if (!KINDS.has(kind)) return new Response('Type de document inconnu', { status: 400 });
  const tenantId = session.user.tenantId;
  const key = `${kind}FileId`;

  const file = await withTenant(tenantId, async (tx) => {
    const p = await tx.person.findUnique({ where: { id: personId } });
    const fileId = (p?.metadata as Record<string, unknown> | null)?.[key];
    if (typeof fileId !== 'string') return null;
    return tx.fileObject.findUnique({ where: { id: fileId } });
  });

  if (!file) return new Response('Aucun document.', { status: 404 });
  const url = await presignedGet(file.s3Key, 15 * 60);
  return Response.redirect(url, 302);
}
