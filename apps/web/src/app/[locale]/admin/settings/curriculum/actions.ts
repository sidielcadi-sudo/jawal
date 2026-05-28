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
  return { code: get('code'), label: get('label'), order: get('order'), cycleId: get('cycleId') };
}

export async function createCycleAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const parsed = cycleSchema.safeParse(input(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const cycle = await tx.cycle.create({ data: { tenantId, ...parsed.data } });
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
