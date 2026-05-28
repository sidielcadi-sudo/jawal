'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';

const yearSchema = z
  .object({
    label: z.string().min(1).max(40),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .refine((d) => d.endDate > d.startDate, { message: 'La date de fin doit être après le début.' });

type Result = { ok: true } | { ok: false; error: string };

function formInput(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' ? v.trim() : '';
  };
  return { label: get('label'), startDate: get('startDate'), endDate: get('endDate') };
}

export async function createYearAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const parsed = yearSchema.safeParse(formInput(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  const tenantId = session.user.tenantId;

  try {
    await withTenant(tenantId, async (tx) => {
      const year = await tx.academicYear.create({
        data: { tenantId, ...parsed.data, active: false },
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'create',
        entityType: 'AcademicYear',
        entityId: year.id,
        after: { label: year.label },
      });
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('Unique constraint')) {
      return { ok: false, error: 'Cette année existe déjà.' };
    }
    throw e;
  }

  revalidatePath('/admin/settings/years');
  return { ok: true };
}

export async function updateYearAction(id: string, formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const parsed = yearSchema.safeParse(formInput(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    const before = await tx.academicYear.findUnique({ where: { id } });
    if (!before) throw new Error('Année introuvable');
    await tx.academicYear.update({ where: { id }, data: parsed.data });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'update',
      entityType: 'AcademicYear',
      entityId: id,
      before: { label: before.label },
      after: { label: parsed.data.label },
    });
  });
  revalidatePath('/admin/settings/years');
  return { ok: true };
}

export async function setActiveYearAction(id: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    await tx.academicYear.updateMany({ where: { active: true }, data: { active: false } });
    await tx.academicYear.update({ where: { id }, data: { active: true } });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'setActive',
      entityType: 'AcademicYear',
      entityId: id,
    });
  });
  revalidatePath('/admin/settings/years');
  revalidatePath('/admin');
  return { ok: true };
}
