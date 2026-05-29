'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { feeScheduleCreateSchema } from '@jawal/shared';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';

type Result = { ok: true } | { ok: false; error: string };

function input(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' ? v.trim() : '';
  };
  return {
    academicYearId: get('academicYearId'),
    levelId: get('levelId'),
    label: get('label'),
    totalAmount: get('totalAmount'),
    installmentCount: get('installmentCount'),
    firstDueMonth: get('firstDueMonth'),
  };
}

export async function createFeeScheduleAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('finance.write');

  const parsed = feeScheduleCreateSchema.safeParse(input(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const s = await tx.feeScheduleItem.create({ data: { tenantId, ...parsed.data } });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'create',
        entityType: 'FeeScheduleItem',
        entityId: s.id,
        after: { label: s.label, totalAmount: Number(s.totalAmount) },
      });
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('Unique constraint')) {
      return { ok: false, error: 'Une grille avec ce libellé existe déjà pour ce niveau et cette année.' };
    }
    throw e;
  }
  revalidatePath('/admin/settings/fees');
  return { ok: true };
}

export async function deleteFeeScheduleAction(id: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('finance.write');

  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    const before = await tx.feeScheduleItem.findUnique({ where: { id } });
    if (!before) throw new Error('Grille introuvable');
    await tx.feeScheduleItem.delete({ where: { id } });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'delete',
      entityType: 'FeeScheduleItem',
      entityId: id,
      before: { label: before.label, totalAmount: Number(before.totalAmount) },
    });
  });
  revalidatePath('/admin/settings/fees');
  return { ok: true };
}
