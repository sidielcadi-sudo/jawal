'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';

type Result = { ok: true } | { ok: false; error: string };

const cycleSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9-_]+$/, 'Minuscules, chiffres, - ou _ uniquement'),
  label: z.string().min(1).max(80),
  order: z.coerce.number().int().min(0).max(99).default(0),
  // Découpage périodique du cycle : trimestres ou semestres.
  periodKind: z.enum(['TRIMESTER', 'SEMESTER']).default('TRIMESTER'),
  // Gestion des salles dans l'EDT : salle attitrée par classe (HOMEROOM,
  // K-12) ou salles mutualisées par séance (POOL, supérieur).
  roomMode: z.enum(['HOMEROOM', 'POOL']).default('HOMEROOM'),
});

const levelSchema = z.object({
  cycleId: z.string().uuid(),
  code: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9-_]+$/, 'Minuscules, chiffres, - ou _ uniquement'),
  label: z.string().min(1).max(80),
  order: z.coerce.number().int().min(0).max(99).default(0),
});

function input(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' ? v.trim() : '';
  };
  return {
    code: get('code'),
    label: get('label'),
    order: get('order'),
    cycleId: get('cycleId'),
    periodKind: get('periodKind') || 'TRIMESTER',
    roomMode: get('roomMode') || 'HOMEROOM',
  };
}

export async function createCycleAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const parsed = cycleSchema.safeParse(input(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  const tenantId = session.user.tenantId;
  const { periodKind, roomMode, ...fields } = parsed.data;
  try {
    await withTenant(tenantId, async (tx) => {
      const cycle = await tx.cycle.create({
        data: { tenantId, ...fields, settings: { periodKind, roomMode } },
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'create',
        entityType: 'Cycle',
        entityId: cycle.id,
        after: parsed.data,
      });
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('Unique constraint')) {
      return { ok: false, error: 'Ce code de cycle existe déjà.' };
    }
    throw e;
  }
  revalidatePath('/admin/settings/curriculum');
  return { ok: true };
}

export async function updateCycleAction(id: string, formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const parsed = cycleSchema.safeParse(input(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  const tenantId = session.user.tenantId;
  const { periodKind, roomMode, ...fields } = parsed.data;
  try {
    await withTenant(tenantId, async (tx) => {
      const before = await tx.cycle.findUnique({ where: { id } });
      if (!before) throw new Error('Cycle introuvable');
      const settings = { ...(before.settings as Record<string, unknown>), periodKind, roomMode };
      await tx.cycle.update({ where: { id }, data: { ...fields, settings } });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'update',
        entityType: 'Cycle',
        entityId: id,
        after: parsed.data,
      });
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('Unique constraint')) {
      return { ok: false, error: 'Ce code de cycle existe déjà.' };
    }
    throw e;
  }
  revalidatePath('/admin/settings/curriculum');
  return { ok: true };
}

export async function deleteCycleAction(id: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      await tx.cycle.delete({ where: { id } });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'delete',
        entityType: 'Cycle',
        entityId: id,
      });
    });
  } catch (e: unknown) {
    if (e instanceof Error && (e.message.includes('Foreign key') || e.message.includes('constraint'))) {
      return {
        ok: false,
        error: 'Impossible de supprimer : des niveaux ou classes dépendent de ce cycle.',
      };
    }
    throw e;
  }
  revalidatePath('/admin/settings/curriculum');
  return { ok: true };
}

export async function createLevelAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const parsed = levelSchema.safeParse(input(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const lvl = await tx.level.create({ data: { tenantId, ...parsed.data } });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'create',
        entityType: 'Level',
        entityId: lvl.id,
        after: parsed.data,
      });
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('Unique constraint')) {
      return { ok: false, error: 'Ce code de niveau existe déjà.' };
    }
    throw e;
  }
  revalidatePath('/admin/settings/curriculum');
  return { ok: true };
}

export async function updateLevelAction(id: string, formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const parsed = levelSchema.safeParse(input(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      await tx.level.update({ where: { id }, data: parsed.data });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'update',
        entityType: 'Level',
        entityId: id,
        after: parsed.data,
      });
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('Unique constraint')) {
      return { ok: false, error: 'Ce code de niveau existe déjà.' };
    }
    throw e;
  }
  revalidatePath('/admin/settings/curriculum');
  return { ok: true };
}

export async function deleteLevelAction(id: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      await tx.level.delete({ where: { id } });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'delete',
        entityType: 'Level',
        entityId: id,
      });
    });
  } catch (e: unknown) {
    if (e instanceof Error && (e.message.includes('Foreign key') || e.message.includes('constraint'))) {
      return {
        ok: false,
        error: 'Impossible de supprimer : des classes ou un programme dépendent de ce niveau.',
      };
    }
    throw e;
  }
  revalidatePath('/admin/settings/curriculum');
  return { ok: true };
}
