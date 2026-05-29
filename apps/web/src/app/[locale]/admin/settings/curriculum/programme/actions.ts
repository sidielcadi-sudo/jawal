'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';

type Result = { ok: true } | { ok: false; error: string };

const SCHEMA = z.object({
  levelId: z.string().uuid(),
  subjectId: z.string().uuid(),
  weeklyHours: z.coerce.number().min(0).max(60),
  coefficient: z.coerce.number().min(0.1).max(20),
  order: z.coerce.number().int().min(0).max(99).default(0),
});

function input(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' ? v.trim() : '';
  };
  return {
    levelId: get('levelId'),
    subjectId: get('subjectId'),
    weeklyHours: get('weeklyHours'),
    coefficient: get('coefficient'),
    order: get('order') || '0',
  };
}

export async function upsertCurriculumSubjectAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const parsed = SCHEMA.safeParse(input(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    const existing = await tx.curriculumSubject.findUnique({
      where: { levelId_subjectId: { levelId: parsed.data.levelId, subjectId: parsed.data.subjectId } },
    });
    if (existing) {
      await tx.curriculumSubject.update({
        where: { id: existing.id },
        data: {
          weeklyHours: parsed.data.weeklyHours,
          coefficient: parsed.data.coefficient,
          order: parsed.data.order,
        },
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'update',
        entityType: 'CurriculumSubject',
        entityId: existing.id,
        before: { weeklyHours: existing.weeklyHours, coefficient: existing.coefficient },
        after: { weeklyHours: parsed.data.weeklyHours, coefficient: parsed.data.coefficient },
      });
    } else {
      const c = await tx.curriculumSubject.create({
        data: { tenantId, ...parsed.data },
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'create',
        entityType: 'CurriculumSubject',
        entityId: c.id,
        after: parsed.data,
      });
    }
  });
  revalidatePath('/admin/settings/curriculum/programme');
  return { ok: true };
}

export async function deleteCurriculumSubjectAction(id: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    await tx.curriculumSubject.delete({ where: { id } });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'delete',
      entityType: 'CurriculumSubject',
      entityId: id,
    });
  });
  revalidatePath('/admin/settings/curriculum/programme');
  return { ok: true };
}
