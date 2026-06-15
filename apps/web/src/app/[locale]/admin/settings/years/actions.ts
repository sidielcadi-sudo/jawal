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

const PERIOD_KINDS = ['TRIMESTER', 'SEMESTER', 'YEAR', 'MODULE', 'SESSION'] as const;

const periodSchema = z
  .object({
    kind: z.enum(PERIOD_KINDS),
    label: z.string().min(1).max(40),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .refine((d) => d.endDate > d.startDate, { message: 'La date de fin doit être après le début.' });

/** Crée une période (trimestre/semestre…) pour une année scolaire. */
export async function createPeriodAction(yearId: string, formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' ? v.trim() : '';
  };
  const parsed = periodSchema.safeParse({
    kind: get('kind') || 'TRIMESTER',
    label: get('label'),
    startDate: get('startDate'),
    endDate: get('endDate'),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    const year = await tx.academicYear.findUnique({ where: { id: yearId } });
    if (!year) throw new Error('Année introuvable');
    const p = await tx.period.create({ data: { tenantId, academicYearId: yearId, ...parsed.data } });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'create',
      entityType: 'Period',
      entityId: p.id,
      after: { label: p.label, kind: p.kind },
    });
  });
  revalidatePath(`/admin/settings/years/${yearId}/edit`);
  return { ok: true };
}

export async function deletePeriodAction(periodId: string, yearId: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      await tx.period.delete({ where: { id: periodId } });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'delete',
        entityType: 'Period',
        entityId: periodId,
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message.includes('Foreign key'))
      return { ok: false, error: 'Période utilisée par des évaluations — impossible de supprimer.' };
    throw e;
  }
  revalidatePath(`/admin/settings/years/${yearId}/edit`);
  return { ok: true };
}

/**
 * Génère automatiquement les périodes standard (3 trimestres ou 2 semestres) en
 * répartissant équitablement l'intervalle [début, fin] de l'année. No-op si des
 * périodes existent déjà.
 */
export async function generatePeriodsAction(
  yearId: string,
  kind: 'TRIMESTER' | 'SEMESTER',
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    const year = await tx.academicYear.findUnique({ where: { id: yearId } });
    if (!year) throw new Error('Année introuvable');
    const existing = await tx.period.count({ where: { academicYearId: yearId } });
    if (existing > 0) throw new Error('Des périodes existent déjà pour cette année.');

    const n = kind === 'TRIMESTER' ? 3 : 2;
    const labelBase = kind === 'TRIMESTER' ? 'Trimestre' : 'Semestre';
    const start = year.startDate.getTime();
    const end = year.endDate.getTime();
    const step = (end - start) / n;
    const data = Array.from({ length: n }, (_, i) => {
      const s = new Date(start + step * i);
      const e = new Date(i === n - 1 ? end : start + step * (i + 1) - 86400000);
      return {
        tenantId,
        academicYearId: yearId,
        kind,
        label: `${labelBase} ${i + 1}`,
        startDate: new Date(s.toISOString().slice(0, 10)),
        endDate: new Date(e.toISOString().slice(0, 10)),
      };
    });
    await tx.period.createMany({ data });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'generatePeriods',
      entityType: 'AcademicYear',
      entityId: yearId,
      after: { kind, count: n },
    });
  });
  revalidatePath(`/admin/settings/years/${yearId}/edit`);
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
