'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { parentCanAccessChild } from '@/lib/parent';
import { putObject } from '@/lib/storage';

type Result = { ok: true } | { ok: false; error: string };

const MAX_BYTES = 5 * 1024 * 1024; // 5 Mo
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/heic',
]);

const schema = z.object({
  attendanceRecordId: z.string().uuid(),
  reasonId: z.string().uuid(),
  comment: z.string().max(1000).optional(),
});

/**
 * Soumission par un PARENT d'une justification d'absence depuis la fiche de son
 * enfant : choisit un motif, ajoute un commentaire et (optionnellement) joint un
 * justificatif. Crée/réinitialise une AbsenceJustification en statut PENDING ;
 * la Vie scolaire l'approuve ensuite (→ absence régularisée).
 */
export async function submitParentJustificationAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  const tenantId = session.user.tenantId;

  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
  };
  const parsed = schema.safeParse({
    attendanceRecordId: get('attendanceRecordId'),
    reasonId: get('reasonId'),
    comment: get('comment'),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  // Justificatif optionnel.
  const file = formData.get('file');
  let upload: { buffer: Buffer; filename: string; mime: string } | null = null;
  if (file && typeof file !== 'string' && file.size > 0) {
    if (file.size > MAX_BYTES) return { ok: false, error: 'Fichier trop volumineux (max 5 Mo).' };
    if (!ALLOWED_MIME.has(file.type)) return { ok: false, error: 'Format non supporté (PDF ou image).' };
    upload = {
      buffer: Buffer.from(await file.arrayBuffer()),
      filename: file.name || 'justificatif',
      mime: file.type,
    };
  }

  try {
    // 1) Validation + contrôle d'accès (transaction courte, sans I/O réseau).
    const ctx = await withTenant(tenantId, async (tx) => {
      const record = await tx.attendanceRecord.findUnique({
        where: { id: parsed.data.attendanceRecordId },
        select: { id: true, studentId: true, status: true },
      });
      if (!record) throw new Error('Absence introuvable.');
      if (!(await parentCanAccessChild(tx, session.user.id, record.studentId)))
        throw new Error('Accès refusé.');
      if (record.status === 'PRESENT') throw new Error('Rien à justifier.');

      const reason = await tx.attendanceReason.findFirst({
        where: { id: parsed.data.reasonId, active: true },
        select: { label: true },
      });
      if (!reason) throw new Error('Motif invalide.');

      const existing = await tx.absenceJustification.findUnique({
        where: { attendanceRecordId: record.id },
        select: { id: true },
      });
      return { recordId: record.id, reasonLabel: reason.label, existingId: existing?.id ?? null };
    });

    const reasonText = parsed.data.comment
      ? `${ctx.reasonLabel}\n\n${parsed.data.comment}`
      : ctx.reasonLabel;

    // 2) Upload du justificatif HORS transaction (I/O réseau S3).
    let s3Key: string | undefined;
    if (upload) {
      const put = await putObject({
        buffer: upload.buffer,
        filename: upload.filename,
        mime: upload.mime,
        tenantId,
        ownerType: 'justification',
        ownerId: ctx.recordId,
      });
      s3Key = put.s3Key;
    }

    // 3) Écriture de la justification (transaction courte).
    await withTenant(tenantId, async (tx) => {
      if (ctx.existingId) {
        await tx.absenceJustification.update({
          where: { id: ctx.existingId },
          data: {
            reason: reasonText,
            ...(s3Key ? { attachmentUrl: s3Key } : {}),
            status: 'PENDING',
            submittedByUserId: session.user.id,
            submittedAt: new Date(),
            reviewedByUserId: null,
            reviewedAt: null,
            reviewNote: null,
          },
        });
      } else {
        await tx.absenceJustification.create({
          data: {
            tenantId,
            attendanceRecordId: ctx.recordId,
            reason: reasonText,
            attachmentUrl: s3Key ?? null,
            status: 'PENDING',
            submittedByUserId: session.user.id,
          },
        });
      }
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: ctx.existingId ? 'resubmit' : 'create',
        entityType: 'AbsenceJustification',
        entityId: ctx.recordId,
        after: { status: 'PENDING', byParent: true },
      });
    });

    revalidatePath('/parent');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
