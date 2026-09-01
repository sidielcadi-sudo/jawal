import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { currentUserRoleCodes } from '@/lib/auth/rbac';
import { putObject, deleteObject, getObjectBuffer } from '@/lib/storage';

const MAX_SIZE = 10 * 1024 * 1024; // 10 Mo
const ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

/**
 * Justificatif attaché à une demande de congé ou d'absence.
 *
 * L'agent accède à la pièce de **sa propre** demande via le lien `UserPerson`,
 * sans droit d'administration : un enseignant doit pouvoir joindre son arrêt de
 * travail. Les gestionnaires RH/vie scolaire accèdent à toutes les demandes.
 * Personne d'autre : un justificatif est une donnée médicale ou familiale.
 */
const MANAGER_ROLES = ['tenant_admin', 'direction', 'cpe', 'scolarite'];

async function guard(requestId: string) {
  const session = await auth();
  if (!session?.user) return null;
  const tenantId = session.user.tenantId;

  const row = await withTenant(tenantId, async (tx) => {
    const req = await tx.leaveRequest.findUnique({
      where: { id: requestId },
      select: { id: true, personId: true, justificationFileId: true, status: true },
    });
    if (!req) return null;
    const link = await tx.userPerson.findFirst({
      where: { userId: session.user.id, personId: req.personId },
      select: { personId: true },
    });
    return { req, isOwner: !!link };
  });
  if (!row) return null;
  const roles = await currentUserRoleCodes();
  if (!row.isOwner && !roles.some((c) => MANAGER_ROLES.includes(c))) return null;
  return { session, tenantId, ...row };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await guard(id);
  if (!ctx) return new Response('Unauthorized', { status: 401 });

  const file = ctx.req.justificationFileId
    ? await withTenant(ctx.tenantId, (tx) =>
        tx.fileObject.findUnique({ where: { id: ctx.req.justificationFileId! } }),
      )
    : null;
  if (!file) return new Response('Aucun justificatif', { status: 404 });

  const body = await getObjectBuffer(file.s3Key);
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': file.mime,
      'Content-Disposition': `inline; filename="${encodeURIComponent(file.filename)}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await guard(id);
  if (!ctx) return new Response('Unauthorized', { status: 401 });

  // Une demande déjà tranchée ne doit plus bouger : le justificatif fait
  // partie du dossier sur lequel la décision a été prise.
  if (ctx.req.status !== 'PENDING') {
    return new Response('Demande déjà traitée', { status: 409 });
  }

  const formData = await req.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) return new Response('Fichier manquant', { status: 400 });
  if (file.size > MAX_SIZE) return new Response('Fichier > 10 Mo', { status: 413 });
  if (!ALLOWED_MIMES.has(file.type))
    return new Response('Formats acceptés : PDF, JPG, PNG, WEBP', { status: 415 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const put = await putObject({
    buffer,
    filename: file.name,
    mime: file.type,
    tenantId: ctx.tenantId,
    ownerType: 'leaveRequest.justification',
    ownerId: id,
  });

  const previousKey = await withTenant(ctx.tenantId, async (tx) => {
    const previous = ctx.req.justificationFileId
      ? await tx.fileObject.findUnique({ where: { id: ctx.req.justificationFileId } })
      : null;
    const newFile = await tx.fileObject.create({
      data: {
        tenantId: ctx.tenantId,
        ownerType: 'leaveRequest.justification',
        ownerId: id,
        s3Key: put.s3Key,
        filename: put.filename,
        mime: put.mime,
        sizeBytes: put.sizeBytes,
      },
    });
    await tx.leaveRequest.update({
      where: { id },
      data: { justificationFileId: newFile.id },
    });
    if (previous) await tx.fileObject.delete({ where: { id: previous.id } });
    await logAudit(tx, {
      tenantId: ctx.tenantId,
      userId: ctx.session.user.id,
      action: 'upload',
      entityType: 'LeaveRequest.justification',
      entityId: id,
      after: { filename: put.filename },
    });
    return previous?.s3Key ?? null;
  });
  if (previousKey) await deleteObject(previousKey).catch(() => {});

  return Response.json({ ok: true });
}
