'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { TEACHER_SERVICE_CODE } from '@jawal/shared';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';

type Result = { ok: true } | { ok: false; error: string };

const CODE_RX = /^[A-Z][A-Z0-9_]*$/;
const CODE_MSG = 'Code : MAJUSCULES, chiffres et _ uniquement (commence par une lettre).';

const ROLE_SCHEMA = z.object({
  appliesTo: z.enum(['TEACHER', 'STAFF']),
  code: z.string().min(1).max(64).regex(CODE_RX, { message: CODE_MSG }),
  labelFr: z.string().min(1).max(100),
  labelAr: z.string().min(1).max(100),
  serviceId: z.preprocess((v) => (v === '' ? undefined : v), z.string().uuid().optional()),
  order: z.coerce.number().int().min(0).max(9999).default(0),
  // Vrai booléen : z.coerce.boolean('false') === true (bug) → on reçoit déjà un boolean.
  active: z.boolean().default(true),
});

const SERVICE_SCHEMA = z.object({
  code: z.string().min(1).max(64).regex(CODE_RX, { message: CODE_MSG }),
  labelFr: z.string().min(1).max(100),
  labelAr: z.string().min(1).max(100),
  order: z.coerce.number().int().min(0).max(9999).default(0),
  active: z.boolean().default(true),
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
    serviceId: get('serviceId'),
    order: get('order') || '0',
    active: formData.get('active') === 'on' || formData.get('active') === 'true',
  };
}

function serviceInput(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' ? v.trim() : '';
  };
  return {
    code: get('code'),
    labelFr: get('labelFr'),
    labelAr: get('labelAr'),
    order: get('order') || '0',
    active: formData.get('active') === 'on' || formData.get('active') === 'true',
  };
}

/** Service « Enseignants » du tenant (service forcé des types TEACHER). */
async function teacherServiceId(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  tenantId: string,
): Promise<string | null> {
  const s = await tx.service.findUnique({
    where: { tenantId_code: { tenantId, code: TEACHER_SERVICE_CODE } },
    select: { id: true },
  });
  return s?.id ?? null;
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
      // Type enseignant → service « Enseignants » forcé.
      const serviceId =
        parsed.data.appliesTo === 'TEACHER'
          ? await teacherServiceId(tx, tenantId)
          : (parsed.data.serviceId ?? null);
      const r = await tx.personRole.create({ data: { tenantId, ...parsed.data, serviceId } });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'create',
        entityType: 'PersonRole',
        entityId: r.id,
        after: { ...parsed.data, serviceId },
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
    const serviceId =
      parsed.data.appliesTo === 'TEACHER'
        ? await teacherServiceId(tx, tenantId)
        : (parsed.data.serviceId ?? null);
    await tx.personRole.update({ where: { id }, data: { ...parsed.data, serviceId } });
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

/** Bascule rapide actif/inactif d'un rôle (clic direct sur le badge). */
export async function toggleRoleActiveAction(id: string, active: boolean): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      await tx.personRole.update({ where: { id }, data: { active } });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'update',
        entityType: 'PersonRole',
        entityId: id,
        after: { active },
      });
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
  revalidatePath('/admin/settings/roles');
  return { ok: true };
}

// ─── Services (départements) ───────────────────────────────────

export async function createServiceAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const parsed = SERVICE_SCHEMA.safeParse(serviceInput(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const s = await tx.service.create({ data: { tenantId, ...parsed.data } });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'create',
        entityType: 'Service',
        entityId: s.id,
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

export async function updateServiceAction(id: string, formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const parsed = SERVICE_SCHEMA.safeParse(serviceInput(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    const before = await tx.service.findUnique({ where: { id } });
    if (!before) throw new Error('Service introuvable');
    await tx.service.update({ where: { id }, data: parsed.data });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'update',
      entityType: 'Service',
      entityId: id,
      before: { labelFr: before.labelFr, labelAr: before.labelAr, active: before.active },
      after: { labelFr: parsed.data.labelFr, labelAr: parsed.data.labelAr, active: parsed.data.active },
    });
  });
  revalidatePath('/admin/settings/roles');
  return { ok: true };
}

/** Bascule rapide actif/inactif d'un service. */
export async function toggleServiceActiveAction(id: string, active: boolean): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      await tx.service.update({ where: { id }, data: { active } });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'update',
        entityType: 'Service',
        entityId: id,
        after: { active },
      });
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
  revalidatePath('/admin/settings/roles');
  return { ok: true };
}

export async function deleteServiceAction(id: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const before = await tx.service.findUnique({ where: { id } });
      if (!before) throw new Error('Service introuvable');
      const [roleCount, personCount] = await Promise.all([
        tx.personRole.count({ where: { serviceId: id } }),
        tx.person.count({ where: { serviceId: id } }),
      ]);
      const inUse = roleCount + personCount;
      if (inUse > 0) {
        throw new Error(
          `Impossible de supprimer : ${inUse} élément(s) rattaché(s) à ce service. Désactivez-le plutôt.`,
        );
      }
      await tx.service.delete({ where: { id } });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'delete',
        entityType: 'Service',
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
