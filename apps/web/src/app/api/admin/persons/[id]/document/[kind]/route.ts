import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { withTenant } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { putObject, deleteObject } from '@/lib/storage';

const MAX_SIZE = 10 * 1024 * 1024; // 10 Mo
const ALLOWED_MIMES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const KINDS = new Set(['cinScan', 'cnssAttestation']);

function metaKey(kind: string) {
  return `${kind}FileId`;
}

/** POST : (re)téléverse un document RH (Scan CIN / Attestation CNSS), id rangé en metadata. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  await requirePermission('tenants.manage');
  const { id: personId, kind } = await params;
  if (!KINDS.has(kind)) return new Response('Type de document inconnu', { status: 400 });
  const tenantId = session.user.tenantId;

  const formData = await req.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) return new Response('Fichier manquant', { status: 400 });
  if (file.size > MAX_SIZE) return new Response('Fichier > 10 Mo', { status: 413 });
  if (!ALLOWED_MIMES.has(file.type)) return new Response('Formats acceptés : PDF, JPEG, PNG, WEBP', { status: 415 });

  const person = await withTenant(tenantId, (tx) => tx.person.findUnique({ where: { id: personId } }));
  if (!person) return new Response('Personne introuvable', { status: 404 });
  if (person.type !== 'TEACHER' && person.type !== 'STAFF') {
    return new Response('Réservé aux enseignants et au personnel.', { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const put = await putObject({ buffer, filename: file.name, mime: file.type, tenantId, ownerType: `person.${kind}`, ownerId: personId });

  const key = metaKey(kind);
  const previousFileKey = await withTenant(tenantId, async (tx) => {
    const metadata = { ...((person.metadata as Record<string, unknown>) ?? {}) };
    const prevId = typeof metadata[key] === 'string' ? (metadata[key] as string) : null;
    const previous = prevId ? await tx.fileObject.findUnique({ where: { id: prevId } }) : null;
    const newFile = await tx.fileObject.create({
      data: { tenantId, ownerType: `person.${kind}`, ownerId: personId, s3Key: put.s3Key, filename: put.filename, mime: put.mime, sizeBytes: put.sizeBytes },
    });
    metadata[key] = newFile.id;
    await tx.person.update({ where: { id: personId }, data: { metadata: metadata as object } });
    if (previous) await tx.fileObject.delete({ where: { id: previous.id } });
    await logAudit(tx, { tenantId, userId: session.user.id, action: 'upload', entityType: `Person.${kind}`, entityId: personId, after: { filename: put.filename } });
    return previous?.s3Key ?? null;
  });

  if (previousFileKey) await deleteObject(previousFileKey);
  return Response.json({ ok: true });
}

/** DELETE : retire le document. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  await requirePermission('tenants.manage');
  const { id: personId, kind } = await params;
  if (!KINDS.has(kind)) return new Response('Type de document inconnu', { status: 400 });
  const tenantId = session.user.tenantId;
  const key = metaKey(kind);

  const s3Key = await withTenant(tenantId, async (tx) => {
    const person = await tx.person.findUnique({ where: { id: personId } });
    const metadata = { ...((person?.metadata as Record<string, unknown>) ?? {}) };
    const prevId = typeof metadata[key] === 'string' ? (metadata[key] as string) : null;
    if (!prevId) return null;
    const file = await tx.fileObject.findUnique({ where: { id: prevId } });
    delete metadata[key];
    await tx.person.update({ where: { id: personId }, data: { metadata: metadata as object } });
    if (file) await tx.fileObject.delete({ where: { id: file.id } });
    await logAudit(tx, { tenantId, userId: session.user.id, action: 'delete', entityType: `Person.${kind}`, entityId: personId });
    return file?.s3Key ?? null;
  });

  if (s3Key) await deleteObject(s3Key);
  return Response.json({ ok: true });
}
