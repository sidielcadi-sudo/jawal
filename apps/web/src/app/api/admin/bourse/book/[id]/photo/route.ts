import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { withTenant } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { putObject, deleteObject, getObjectBuffer } from '@/lib/storage';

const MAX_SIZE = 5 * 1024 * 1024; // 5 Mo
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Sert la couverture du livre (ou 404 si aucune n'a été téléversée). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;

  const file = await withTenant(session.user.tenantId, async (tx) => {
    const book = await tx.book.findUnique({ where: { id }, select: { photoFileId: true } });
    if (!book?.photoFileId) return null;
    return tx.fileObject.findUnique({ where: { id: book.photoFileId } });
  });
  if (!file) return new Response('Aucune photo', { status: 404 });

  const body = await getObjectBuffer(file.s3Key);
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': file.mime,
      // Photo stable pour un livre donné ; le cache court évite de recharger
      // la couverture à chaque affichage du catalogue.
      'Cache-Control': 'private, max-age=300',
    },
  });
}

/** Téléverse ou remplace la couverture du livre. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  await requirePermission('tenants.manage');

  const { id } = await params;
  const tenantId = session.user.tenantId;

  const formData = await req.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) return new Response('Fichier manquant', { status: 400 });
  if (file.size > MAX_SIZE) return new Response('Image > 5 Mo', { status: 413 });
  if (!ALLOWED_MIMES.has(file.type))
    return new Response('Formats acceptés : JPG, PNG, WEBP', { status: 415 });

  const book = await withTenant(tenantId, (tx) => tx.book.findUnique({ where: { id } }));
  if (!book) return new Response('Livre introuvable', { status: 404 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const put = await putObject({
    buffer,
    filename: file.name,
    mime: file.type,
    tenantId,
    ownerType: 'book.photo',
    ownerId: id,
  });

  // L'ancienne image n'est supprimée du stockage qu'après le basculement en
  // base : en cas d'échec, on préfère un fichier orphelin à une photo perdue.
  const previousKey = await withTenant(tenantId, async (tx) => {
    const previous = book.photoFileId
      ? await tx.fileObject.findUnique({ where: { id: book.photoFileId } })
      : null;
    const newFile = await tx.fileObject.create({
      data: {
        tenantId,
        ownerType: 'book.photo',
        ownerId: id,
        s3Key: put.s3Key,
        filename: put.filename,
        mime: put.mime,
        sizeBytes: put.sizeBytes,
      },
    });
    await tx.book.update({ where: { id }, data: { photoFileId: newFile.id } });
    if (previous) await tx.fileObject.delete({ where: { id: previous.id } });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'upload',
      entityType: 'Book.photo',
      entityId: id,
      after: { filename: put.filename },
    });
    return previous?.s3Key ?? null;
  });
  if (previousKey) await deleteObject(previousKey).catch(() => {});

  return Response.json({ ok: true });
}
