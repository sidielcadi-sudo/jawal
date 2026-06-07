import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { withTenant } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { putObject, deleteObject } from '@/lib/storage';

const MAX_SIZE = 5 * 1024 * 1024; // 5 Mo
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  await requirePermission('students.write');

  const { id: personId } = await params;
  const tenantId = session.user.tenantId;

  const formData = await req.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) return new Response('Fichier manquant', { status: 400 });
  if (file.size > MAX_SIZE) return new Response('Image > 5 Mo', { status: 413 });
  if (!ALLOWED_MIMES.has(file.type))
    return new Response('Formats acceptés : JPG, PNG, WEBP', { status: 415 });

  const person = await withTenant(tenantId, (tx) => tx.person.findUnique({ where: { id: personId } }));
  if (!person) return new Response('Personne introuvable', { status: 404 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const put = await putObject({
    buffer,
    filename: file.name,
    mime: file.type,
    tenantId,
    ownerType: 'person.photo',
    ownerId: personId,
  });

  const previousKey = await withTenant(tenantId, async (tx) => {
    const previous = person.photoFileId
      ? await tx.fileObject.findUnique({ where: { id: person.photoFileId } })
      : null;
    const newFile = await tx.fileObject.create({
      data: {
        tenantId,
        ownerType: 'person.photo',
        ownerId: personId,
        s3Key: put.s3Key,
        filename: put.filename,
        mime: put.mime,
        sizeBytes: put.sizeBytes,
      },
    });
    await tx.person.update({ where: { id: personId }, data: { photoFileId: newFile.id } });
    if (previous) await tx.fileObject.delete({ where: { id: previous.id } });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'upload',
      entityType: 'PersonPhoto',
      entityId: personId,
      after: { filename: put.filename, sizeBytes: put.sizeBytes },
    });
    return previous?.s3Key ?? null;
  });

  if (previousKey) await deleteObject(previousKey).catch(() => {});

  return Response.json({ ok: true });
}
