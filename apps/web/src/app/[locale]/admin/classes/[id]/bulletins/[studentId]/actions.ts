'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { councilEntrySchema, subjectAppreciationSchema } from '@jawal/shared';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';

type Result = { ok: true } | { ok: false; error: string };

function fl<T>(parsed: z.SafeParseError<T>): string {
  return parsed.error.issues[0]?.message ?? 'Invalide';
}

/**
 * Upsert d'une appréciation par matière pour (student, subject, period).
 * Si text vide → suppression de l'appréciation existante.
 */
export async function saveSubjectAppreciationAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('grades.write');

  const raw = {
    studentId: formData.get('studentId'),
    subjectId: formData.get('subjectId'),
    periodId: formData.get('periodId'),
    text: typeof formData.get('text') === 'string' ? String(formData.get('text')).trim() : '',
  };

  // Si text vide → supprime l'appréciation existante
  if (raw.text === '') {
    const sid = typeof raw.studentId === 'string' ? raw.studentId : '';
    const subj = typeof raw.subjectId === 'string' ? raw.subjectId : '';
    const pid = typeof raw.periodId === 'string' ? raw.periodId : '';
    if (!sid || !subj || !pid) return { ok: false, error: 'Paramètres manquants' };
    await withTenant(session.user.tenantId, async (tx) => {
      const before = await tx.subjectAppreciation.findUnique({
        where: { studentId_subjectId_periodId: { studentId: sid, subjectId: subj, periodId: pid } },
      });
      if (!before) return;
      await tx.subjectAppreciation.delete({ where: { id: before.id } });
      await logAudit(tx, {
        tenantId: session.user.tenantId,
        userId: session.user.id,
        action: 'delete',
        entityType: 'SubjectAppreciation',
        entityId: before.id,
      });
    });
    revalidatePath('/admin/classes');
    return { ok: true };
  }

  const parsed = subjectAppreciationSchema.safeParse({ ...raw, text: raw.text });
  if (!parsed.success) return { ok: false, error: fl(parsed) };

  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    const existing = await tx.subjectAppreciation.findUnique({
      where: {
        studentId_subjectId_periodId: {
          studentId: parsed.data.studentId,
          subjectId: parsed.data.subjectId,
          periodId: parsed.data.periodId,
        },
      },
    });
    if (existing) {
      await tx.subjectAppreciation.update({
        where: { id: existing.id },
        data: { text: parsed.data.text, authoredByUserId: session.user.id },
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'update',
        entityType: 'SubjectAppreciation',
        entityId: existing.id,
        before: { text: existing.text },
        after: { text: parsed.data.text },
      });
    } else {
      const a = await tx.subjectAppreciation.create({
        data: { tenantId, ...parsed.data, authoredByUserId: session.user.id },
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'create',
        entityType: 'SubjectAppreciation',
        entityId: a.id,
        after: { studentId: a.studentId, subjectId: a.subjectId, periodId: a.periodId },
      });
    }
  });

  revalidatePath('/admin/classes');
  return { ok: true };
}

/**
 * Upsert d'une entrée conseil de classe pour (class, period, student).
 */
export async function saveCouncilEntryAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('grades.write');

  const parsed = councilEntrySchema.safeParse({
    classId: formData.get('classId'),
    studentId: formData.get('studentId'),
    periodId: formData.get('periodId'),
    generalAppreciation: formData.get('generalAppreciation'),
    decision: formData.get('decision'),
    heldAt: formData.get('heldAt'),
  });
  if (!parsed.success) return { ok: false, error: fl(parsed) };

  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    const existing = await tx.councilEntry.findUnique({
      where: {
        classId_periodId_studentId: {
          classId: parsed.data.classId,
          periodId: parsed.data.periodId,
          studentId: parsed.data.studentId,
        },
      },
    });
    const payload = {
      generalAppreciation: parsed.data.generalAppreciation ?? null,
      decision: parsed.data.decision ?? null,
      heldAt: parsed.data.heldAt ?? null,
      authoredByUserId: session.user.id,
    };
    if (existing) {
      await tx.councilEntry.update({
        where: { id: existing.id },
        data: payload,
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'update',
        entityType: 'CouncilEntry',
        entityId: existing.id,
        before: {
          generalAppreciation: existing.generalAppreciation,
          decision: existing.decision,
        },
        after: payload,
      });
    } else {
      const c = await tx.councilEntry.create({
        data: {
          tenantId,
          classId: parsed.data.classId,
          studentId: parsed.data.studentId,
          periodId: parsed.data.periodId,
          ...payload,
        },
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'create',
        entityType: 'CouncilEntry',
        entityId: c.id,
        after: payload,
      });
    }
  });

  revalidatePath('/admin/classes');
  return { ok: true };
}
