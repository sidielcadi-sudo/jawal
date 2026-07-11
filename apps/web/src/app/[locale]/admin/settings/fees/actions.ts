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
    kind: get('kind') || 'ANNUAL',
    category: get('category') || 'TUITION',
    totalAmount: get('totalAmount'),
    installmentCount: get('installmentCount'),
    installmentLocked: formData.get('installmentLocked') === 'on' || formData.get('installmentLocked') === 'true',
    firstDueMonth: get('firstDueMonth'),
  };
}

const REFUND_CATS = ['TUITION', 'INSCRIPTION', 'TRANSPORT', 'CANTEEN', 'DAYCARE', 'OTHER'] as const;

/**
 * Enregistre la remboursabilité par catégorie de frais (utilisée pour le calcul
 * du remboursement lors d'une radiation en cours d'année). Stocké dans
 * `tenant.settings.refundableCategories`.
 */
export async function saveRefundableCategoriesAction(map: Record<string, boolean>): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('finance.write');
  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const tenant = await tx.tenant.findFirstOrThrow({ select: { id: true, settings: true } });
      const refundableCategories = Object.fromEntries(REFUND_CATS.map((c) => [c, map[c] !== false]));
      const settings = { ...((tenant.settings as Record<string, unknown>) ?? {}), refundableCategories };
      await tx.tenant.update({ where: { id: tenant.id }, data: { settings } });
      await logAudit(tx, { tenantId, userId: session.user.id, action: 'update', entityType: 'Tenant', entityId: tenant.id, after: { refundableCategories } });
    });
    revalidatePath('/admin/settings/fees');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
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

const FEE_UPDATE_SCHEMA = z.object({
  label: z.string().min(1).max(100),
  category: z.enum(['TUITION', 'TRANSPORT', 'CANTEEN', 'DAYCARE', 'OTHER']),
  totalAmount: z.coerce.number().min(1).max(100_000_000),
  installmentCount: z.coerce.number().int().min(1).max(24),
  installmentLocked: z.boolean(),
  firstDueMonth: z.coerce.number().int().min(1).max(12),
});

/** Modifie une grille tarifaire (libellé, catégorie, montant, nb d'échéances, 1er mois). */
export async function updateFeeScheduleAction(id: string, formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('finance.write');

  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' ? v.trim() : '';
  };
  const parsed = FEE_UPDATE_SCHEMA.safeParse({
    label: get('label'),
    category: get('category') || 'TUITION',
    totalAmount: get('totalAmount'),
    installmentCount: get('installmentCount') || '9',
    installmentLocked: formData.get('installmentLocked') === 'on' || formData.get('installmentLocked') === 'true',
    firstDueMonth: get('firstDueMonth') || '9',
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const before = await tx.feeScheduleItem.findUnique({ where: { id } });
      if (!before) throw new Error('Grille introuvable');
      await tx.feeScheduleItem.update({ where: { id }, data: parsed.data });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'update',
        entityType: 'FeeScheduleItem',
        entityId: id,
        before: { label: before.label, totalAmount: Number(before.totalAmount) },
        after: { label: parsed.data.label, totalAmount: parsed.data.totalAmount },
      });
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('Unique constraint')) {
      return { ok: false, error: 'Une grille avec ce libellé existe déjà pour ce niveau et cette année.' };
    }
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
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

// ─── Réductions paramétrables (catalogue tenant) ──────────────────────────

const DISCOUNT_SCHEMA = z.object({
  label: z.string().min(1).max(100),
  pct: z.coerce.number().min(0).max(100),
  active: z.coerce.boolean(),
  order: z.coerce.number().int().min(0).max(999),
  feeScheduleItemId: z.string().uuid().nullable(),
});

function discountInput(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' ? v.trim() : '';
  };
  const feeId = get('feeScheduleItemId');
  return {
    label: get('label'),
    pct: get('pct'),
    active: formData.get('active') === 'on' || formData.get('active') === 'true',
    order: get('order') || '0',
    feeScheduleItemId: feeId || null,
  };
}

export async function createDiscountRuleAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('finance.write');

  const parsed = DISCOUNT_SCHEMA.safeParse(discountInput(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    const d = await tx.discountRule.create({ data: { tenantId, ...parsed.data } });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'create',
      entityType: 'DiscountRule',
      entityId: d.id,
      after: { label: d.label, pct: Number(d.pct) },
    });
  });
  revalidatePath('/admin/settings/fees');
  return { ok: true };
}

export async function updateDiscountRuleAction(id: string, formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('finance.write');

  const parsed = DISCOUNT_SCHEMA.safeParse(discountInput(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const before = await tx.discountRule.findUnique({ where: { id } });
      if (!before) throw new Error('Réduction introuvable');
      await tx.discountRule.update({ where: { id }, data: parsed.data });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'update',
        entityType: 'DiscountRule',
        entityId: id,
        before: { label: before.label, pct: Number(before.pct) },
        after: { label: parsed.data.label, pct: parsed.data.pct },
      });
    });
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
  revalidatePath('/admin/settings/fees');
  return { ok: true };
}

export async function deleteDiscountRuleAction(id: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('finance.write');

  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    const before = await tx.discountRule.findUnique({ where: { id } });
    if (!before) throw new Error('Réduction introuvable');
    await tx.discountRule.delete({ where: { id } });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'delete',
      entityType: 'DiscountRule',
      entityId: id,
      before: { label: before.label, pct: Number(before.pct) },
    });
  });
  revalidatePath('/admin/settings/fees');
  return { ok: true };
}
