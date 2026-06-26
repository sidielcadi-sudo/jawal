import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { withTenant, prismaAdmin } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { putObject, deleteObject } from '@/lib/storage';

const MAX_SIZE = 2 * 1024 * 1024; // 2 Mo
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']);

/** Téléverse / remplace le logo de l'établissement. */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  await requirePermission('tenants.manage');

  const tenantId = session.user.tenantId;
  const formData = await req.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) return new Response('Fichier manquant', { status: 400 });
  if (file.size > MAX_SIZE) return new Response('Image > 2 Mo', { status: 413 });
  if (!ALLOWED_MIMES.has(file.type))
    return new Response('Formats acceptés : JPG, PNG, WEBP, SVG', { status: 415 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const put = await putObject({
    buffer,
    filename: file.name,
    mime: file.type,
    tenantId,
    ownerType: 'tenant.logo',
    ownerId: tenantId,
  });

  const tenant = await prismaAdmin.tenant.findUnique({
    where: { id: tenantId },
    select: { logoFileId: true },
  });

  const newFileId = await withTenant(tenantId, async (tx) => {
    const newFile = await tx.fileObject.create({
      data: {
        tenantId,
        ownerType: 'tenant.logo',
        ownerId: tenantId,
        s3Key: put.s3Key,
        filename: put.filename,
        mime: put.mime,
        sizeBytes: put.sizeBytes,
      },
    });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'upload',
      entityType: 'TenantLogo',
      entityId: tenantId,
      after: { filename: put.filename, sizeBytes: put.sizeBytes },
    });
    return newFile.id;
  });

  // Bascule la référence du tenant (table tenant → prismaAdmin), puis purge l'ancien.
  await prismaAdmin.tenant.update({ where: { id: tenantId }, data: { logoFileId: newFileId } });

  if (tenant?.logoFileId) {
    const old = await withTenant(tenantId, async (tx) => {
      const f = await tx.fileObject.findUnique({ where: { id: tenant.logoFileId! } });
      if (f) await tx.fileObject.delete({ where: { id: f.id } });
      return f?.s3Key ?? null;
    });
    if (old) await deleteObject(old).catch(() => {});
  }

  return Response.json({ ok: true });
}

/** Supprime le logo de l'établissement (retour au logo par défaut). */
export async function DELETE() {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  await requirePermission('tenants.manage');

  const tenantId = session.user.tenantId;
  const tenant = await prismaAdmin.tenant.findUnique({
    where: { id: tenantId },
    select: { logoFileId: true },
  });
  if (!tenant?.logoFileId) return Response.json({ ok: true });

  await prismaAdmin.tenant.update({ where: { id: tenantId }, data: { logoFileId: null } });
  const old = await withTenant(tenantId, async (tx) => {
    const f = await tx.fileObject.findUnique({ where: { id: tenant.logoFileId! } });
    if (f) await tx.fileObject.delete({ where: { id: f.id } });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'delete',
      entityType: 'TenantLogo',
      entityId: tenantId,
    });
    return f?.s3Key ?? null;
  });
  if (old) await deleteObject(old).catch(() => {});

  return Response.json({ ok: true });
}
