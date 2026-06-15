import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { withTenant } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { putObject } from '@/lib/storage';

const MAX_SIZE = 10 * 1024 * 1024; // 10 Mo
const ALLOWED = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

/** Dépose une pièce justificative pour un dossier d'inscription. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  await requirePermission('tenants.manage');

  const { id: enrollmentId } = await params;
  const tenantId = session.user.tenantId;

  const formData = await req.formData();
  const file = formData.get('file');
  const requiredDocumentId = formData.get('requiredDocumentId');
  if (!(file instanceof File)) return new Response('Fichier manquant', { status: 400 });
  if (file.size > MAX_SIZE) return new Response('Fichier > 10 Mo', { status: 413 });
  if (!ALLOWED.has(file.type)) return new Response('Formats : PDF, JPG, PNG, WEBP', { status: 415 });

  const enrollment = await withTenant(tenantId, (tx) =>
    tx.enrollment.findUnique({ where: { id: enrollmentId } }),
  );
  if (!enrollment) return new Response('Dossier introuvable', { status: 404 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const put = await putObject({
    buffer,
    filename: file.name,
    mime: file.type,
    tenantId,
    ownerType: 'enrollment.document',
    ownerId: enrollmentId,
  });

  await withTenant(tenantId, async (tx) => {
    const fileObj = await tx.fileObject.create({
      data: {
        tenantId,
        ownerType: 'enrollment.document',
        ownerId: enrollmentId,
        s3Key: put.s3Key,
        filename: put.filename,
        mime: put.mime,
        sizeBytes: put.sizeBytes,
      },
    });
    await tx.enrollmentDocument.create({
      data: {
        tenantId,
        enrollmentId,
        requiredDocumentId:
          typeof requiredDocumentId === 'string' && requiredDocumentId ? requiredDocumentId : null,
        fileId: fileObj.id,
        status: 'PENDING',
      },
    });
    // Un dépôt avant décision repasse le dossier en « documents manquants »
    // (pièce non encore validée). La validation recalcule « complet ».
    if (['DRAFT', 'DOSSIER_COMPLET'].includes(enrollment.status)) {
      await tx.enrollment.update({
        where: { id: enrollmentId },
        data: { status: 'DOCUMENTS_MANQUANTS' },
      });
    }
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'uploadDocument',
      entityType: 'Enrollment',
      entityId: enrollmentId,
      after: { filename: put.filename },
    });
  });

  return Response.json({ ok: true });
}
