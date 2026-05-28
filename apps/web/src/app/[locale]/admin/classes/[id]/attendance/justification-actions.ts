'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { justificationCreateSchema, justificationReviewSchema } from '@jawal/shared';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';

type Result = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

function flatten<T>(parsed: z.SafeParseError<T>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join('.');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * Soumet une justification pour un AttendanceRecord (en pratique : un absent
 * ou un retard). Upsert : remplace une justification existante si l'admin
 * la corrige (revient à PENDING).
 */
export async function submitJustificationAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('attendance.write');

  const parsed = justificationCreateSchema.safeParse({
    attendanceRecordId: formData.get('attendanceRecordId'),
    reason: formData.get('reason'),
    attachmentUrl: formData.get('attachmentUrl'),
  });
  if (!parsed.success) return { ok: false, error: 'Données invalides.', fieldErrors: flatten(parsed) };

  const tenantId = session.user.tenantId;
  const { attendanceRecordId, reason, attachmentUrl } = parsed.data;

  await withTenant(tenantId, async (tx) => {
    const record = await tx.attendanceRecord.findUnique({
      where: { id: attendanceRecordId },
      include: { session: true },
    });
    if (!record) throw new Error('Record introuvable');
    if (record.status === 'PRESENT') throw new Error('Impossible de justifier une présence');

    const existing = await tx.absenceJustification.findUnique({
      where: { attendanceRecordId },
    });

    if (existing) {
      await tx.absenceJustification.update({
        where: { id: existing.id },
        data: {
          reason,
          attachmentUrl: attachmentUrl ?? null,
          status: 'PENDING',
          reviewedByUserId: null,
          reviewedAt: null,
          reviewNote: null,
        },
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'resubmit',
        entityType: 'AbsenceJustification',
        entityId: existing.id,
        after: { reason },
      });
    } else {
      const j = await tx.absenceJustification.create({
        data: {
          tenantId,
          attendanceRecordId,
          reason,
          attachmentUrl: attachmentUrl ?? null,
          submittedByUserId: session.user.id,
        },
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'create',
        entityType: 'AbsenceJustification',
        entityId: j.id,
        after: { reason, attendanceRecordId },
      });
    }
  });

  revalidatePath('/admin/classes');
  return { ok: true };
}

export async function reviewJustificationAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('attendance.write');

  const parsed = justificationReviewSchema.safeParse({
    justificationId: formData.get('justificationId'),
    decision: formData.get('decision'),
    reviewNote: formData.get('reviewNote'),
  });
  if (!parsed.success) return { ok: false, error: 'Données invalides.', fieldErrors: flatten(parsed) };

  const tenantId = session.user.tenantId;

  await withTenant(tenantId, async (tx) => {
    const before = await tx.absenceJustification.findUnique({ where: { id: parsed.data.justificationId } });
    if (!before) throw new Error('Justification introuvable');

    await tx.absenceJustification.update({
      where: { id: parsed.data.justificationId },
      data: {
        status: parsed.data.decision,
        reviewedByUserId: session.user.id,
        reviewedAt: new Date(),
        reviewNote: parsed.data.reviewNote ?? null,
      },
    });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: parsed.data.decision === 'APPROVED' ? 'approve' : 'reject',
      entityType: 'AbsenceJustification',
      entityId: parsed.data.justificationId,
      before: { status: before.status },
      after: { status: parsed.data.decision },
    });
  });

  revalidatePath('/admin/classes');
  return { ok: true };
}
