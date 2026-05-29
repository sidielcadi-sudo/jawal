import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { withTenant } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { putObject, deleteObject } from '@/lib/storage';

const MAX_SIZE = 10 * 1024 * 1024; // 10 Mo
const ALLOWED_MIMES = new Set(['application/pdf']);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  await requirePermission('tenants.manage');

  const { id: personId } = await params;
  const tenantId = session.user.tenantId;

  const formData = await req.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) return new Response('Fichier manquant', { status: 400 });
  if (file.size > MAX_SIZE) return new Response('Fichier > 10 Mo', { status: 413 });
  if (!ALLOWED_MIMES.has(file.type)) return new Response('Seul le PDF est accepté', { status: 415 });

  // Vérifie que la personne existe et est TEACHER/STAFF
  const person = await withTenant(tenantId, (tx) => tx.person.findUnique({ where: { id: personId } }));
  if (!person) return new Response('Personne introuvable', { status: 404 });
  if (person.type !== 'TEACHER' && person.type !== 'STAFF') {
    return new Response('Le contrat ne concerne que les enseignants et le personnel.', { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const put = await putObject({
    buffer,
    filename: file.name,
    mime: file.type,
    tenantId,
    ownerType: 'person.contract',
    ownerId: personId,
  });

  // Création FileObject + remplacement du contractFileId atomiquement
  const previousFileKey = await withTenant(tenantId, async (tx) => {
    const previous = person.contractFileId
      ? await tx.fileObject.findUnique({ where: { id: person.contractFileId } })
      : null;

    const newFile = await tx.fileObject.create({
      data: {
        tenantId,
        ownerType: 'person.contract',
        ownerId: personId,
        s3Key: put.s3Key,
        filename: put.filename,
        mime: put.mime,
        sizeBytes: put.sizeBytes,
      },
    });

    await tx.person.update({
      where: { id: personId },
      data: { contractFileId: newFile.id },
    });

    if (previous) {
      await tx.fileObject.delete({ where: { id: previous.id } });
    }

    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'upload',
      entityType: 'PersonContract',
      entityId: personId,
      after: { filename: put.filename, sizeBytes: put.sizeBytes },
    });

    return previous?.s3Key ?? null;
  });

  if (previousFileKey) {
    await deleteObject(previousFileKey);
  }

  return Response.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  await requirePermission('tenants.manage');

  const { id: personId } = await params;
  const tenantId = session.user.tenantId;

  const s3Key = await withTenant(tenantId, async (tx) => {
    const person = await tx.person.findUnique({ where: { id: personId } });
    if (!person?.contractFileId) return null;

    const file = await tx.fileObject.findUnique({ where: { id: person.contractFileId } });
    await tx.person.update({ where: { id: personId }, data: { contractFileId: null } });
    if (file) await tx.fileObject.delete({ where: { id: file.id } });

    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'delete',
      entityType: 'PersonContract',
      entityId: personId,
    });

    return file?.s3Key ?? null;
  });

  if (s3Key) await deleteObject(s3Key);
  return Response.json({ ok: true });
}
