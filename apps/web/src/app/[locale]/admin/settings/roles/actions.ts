'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';

type Result = { ok: true } | { ok: false; error: string };

const ROLE_SCHEMA = z.object({
  appliesTo: z.enum(['TEACHER', 'STAFF']),
  code: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Z][A-Z0-9_]*$/, {
      message: 'Code : MAJUSCULES, chiffres et _ uniquement (commence par une lettre).',
    }),
  labelFr: z.string().min(1).max(100),
  labelAr: z.string().min(1).max(100),
  order: z.coerce.number().int().min(0).max(9999).default(0),
  active: z.coerce.boolean().default(true),
});

function input(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' ? v.trim() : '';
  };
  return {
    appliesTo: get('appliesTo'),
    code: get('code'),
    labelFr: get('labelFr'),
    labelAr: get('labelAr'),
    order: get('order') || '0',
    active: formData.get('active') === 'on' || formData.get('active') === 'true' ? 'true' : 'false',
  };
}

export async function createRoleAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const parsed = ROLE_SCHEMA.safeParse(input(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const r = await tx.personRole.create({ data: { tenantId, ...parsed.data } });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'create',
        entityType: 'PersonRole',
        entityId: r.id,
        after: parsed.data,
      });
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('Unique constraint')) {
      return { ok: false, error: 'Ce code existe déjà.' };
    }
    throw e;
  }
  revalidatePath('/admin/settings/roles');
  return { ok: true };
}

export async function updateRoleAction(id: string, formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const parsed = ROLE_SCHEMA.safeParse(input(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    const before = await tx.personRole.findUnique({ where: { id } });
    if (!before) throw new Error('Rôle introuvable');
    await tx.personRole.update({ where: { id }, data: parsed.data });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'update',
      entityType: 'PersonRole',
      entityId: id,
      before: { labelFr: before.labelFr, labelAr: before.labelAr, active: before.active },
      after: { labelFr: parsed.data.labelFr, labelAr: parsed.data.labelAr, active: parsed.data.active },
    });
  });
  revalidatePath('/admin/settings/roles');
  return { ok: true };
}

export async function deleteRoleAction(id: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const before = await tx.personRole.findUnique({ where: { id } });
      if (!before) throw new Error('Rôle introuvable');
      const inUse = await tx.person.count({ where: { roleId: id } });
      if (inUse > 0) {
        throw new Error(
          `Impossible de supprimer : ${inUse} personne(s) utilise(nt) ce rôle. Désactivez-le plutôt.`,
        );
      }
      await tx.personRole.delete({ where: { id } });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'delete',
        entityType: 'PersonRole',
        entityId: id,
        before: { code: before.code, labelFr: before.labelFr },
      });
    });
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Suppression impossible.' };
  }
  revalidatePath('/admin/settings/roles');
  return { ok: true };
}
