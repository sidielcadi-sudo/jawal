'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';

type Result = { ok: true } | { ok: false; error: string };

const docSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[A-Z0-9_]+$/, 'Majuscules, chiffres, _ uniquement'),
  labelFr: z.string().min(1).max(120),
  labelAr: z.string().min(1).max(120),
  levelId: z.string().uuid().optional().nullable(),
  required: z.coerce.boolean().default(true),
  order: z.coerce.number().int().min(0).max(999).default(0),
});

function read(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' ? v.trim() : '';
  };
  return {
    code: get('code'),
    labelFr: get('labelFr'),
    labelAr: get('labelAr'),
    levelId: get('levelId') || null,
    required: formData.get('required') === 'on' || formData.get('required') === 'true',
    order: get('order') || '0',
  };
}

export async function createRequiredDocumentAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  const parsed = docSchema.safeParse(read(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };
  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const d = await tx.requiredDocument.create({ data: { tenantId, ...parsed.data } });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'create',
        entityType: 'RequiredDocument',
        entityId: d.id,
        after: parsed.data,
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message.includes('Unique constraint'))
      return { ok: false, error: 'Ce code existe déjà.' };
    throw e;
  }
  revalidatePath('/admin/settings/admissions');
  return { ok: true };
}

export async function updateRequiredDocumentAction(id: string, formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  const parsed = docSchema.safeParse(read(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };
  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      await tx.requiredDocument.update({ where: { id }, data: parsed.data });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'update',
        entityType: 'RequiredDocument',
        entityId: id,
        after: parsed.data,
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message.includes('Unique constraint'))
      return { ok: false, error: 'Ce code existe déjà.' };
    throw e;
  }
  revalidatePath('/admin/settings/admissions');
  return { ok: true };
}

export async function deleteRequiredDocumentAction(id: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    await tx.requiredDocument.delete({ where: { id } });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'delete',
      entityType: 'RequiredDocument',
      entityId: id,
    });
  });
  revalidatePath('/admin/settings/admissions');
  return { ok: true };
}

const quotaSchema = z.object({
  academicYearId: z.string().uuid(),
  levelId: z.string().uuid(),
  capacity: z.coerce.number().int().min(0).max(100000),
});

export async function setAdmissionQuotaAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  const parsed = quotaSchema.safeParse({
    academicYearId: formData.get('academicYearId'),
    levelId: formData.get('levelId'),
    capacity: formData.get('capacity'),
  });
  if (!parsed.success) return { ok: false, error: 'Données invalides.' };
  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    await tx.admissionQuota.upsert({
      where: {
        academicYearId_levelId: {
          academicYearId: parsed.data.academicYearId,
          levelId: parsed.data.levelId,
        },
      },
      update: { capacity: parsed.data.capacity },
      create: { tenantId, ...parsed.data },
    });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'setQuota',
      entityType: 'AdmissionQuota',
      entityId: `${parsed.data.academicYearId}:${parsed.data.levelId}`,
      after: parsed.data,
    });
  });
  revalidatePath('/admin/settings/admissions');
  return { ok: true };
}
