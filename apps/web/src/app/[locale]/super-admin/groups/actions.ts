'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prismaAdmin } from '@jawal/db';
import { auth } from '@/lib/auth';

type Result = { ok: true; message?: string } | { ok: false; error: string };

async function requireSuperAdmin(): Promise<boolean> {
  const session = await auth();
  return Boolean(session?.user?.isSuperAdmin);
}

const groupSchema = z.object({
  name: z.string().min(2).max(200),
  slug: z
    .string()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'Lettres minuscules, chiffres et tirets uniquement'),
});

/** Crée un groupe scolaire. */
export async function createGroupAction(formData: FormData): Promise<Result> {
  if (!(await requireSuperAdmin())) return { ok: false, error: 'Non autorisé.' };
  const parsed = groupSchema.safeParse({ name: formData.get('name'), slug: formData.get('slug') });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  const existing = await prismaAdmin.tenantGroup.findUnique({ where: { slug: parsed.data.slug } });
  if (existing) return { ok: false, error: `Le slug « ${parsed.data.slug} » est déjà pris.` };

  await prismaAdmin.tenantGroup.create({ data: parsed.data });
  revalidatePath('/super-admin/groups');
  return { ok: true };
}

const attachSchema = z.object({
  tenantId: z.string().uuid(),
  groupId: z.string().uuid().or(z.literal('')),
});

/** Rattache (ou détache si groupId='') un établissement à un groupe. */
export async function setTenantGroupAction(formData: FormData): Promise<Result> {
  if (!(await requireSuperAdmin())) return { ok: false, error: 'Non autorisé.' };
  const parsed = attachSchema.safeParse({
    tenantId: formData.get('tenantId'),
    groupId: formData.get('groupId'),
  });
  if (!parsed.success) return { ok: false, error: 'Données invalides.' };

  await prismaAdmin.tenant.update({
    where: { id: parsed.data.tenantId },
    data: { groupId: parsed.data.groupId || null },
  });
  revalidatePath('/super-admin/groups');
  return { ok: true };
}

const grantSchema = z.object({
  homeTenantId: z.string().uuid(),
  email: z.string().email().toLowerCase(),
  targetTenantId: z.string().uuid(),
  roleCode: z.string().min(1).max(64),
});

/**
 * Accorde à un compte (résolu par email dans son tenant « home ») l'accès à un
 * autre établissement : crée le lien UserTenant + un UserRole dans le site cible.
 */
export async function grantSiteAccessAction(formData: FormData): Promise<Result> {
  if (!(await requireSuperAdmin())) return { ok: false, error: 'Non autorisé.' };
  const parsed = grantSchema.safeParse({
    homeTenantId: formData.get('homeTenantId'),
    email: formData.get('email'),
    targetTenantId: formData.get('targetTenantId'),
    roleCode: formData.get('roleCode'),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };
  const { homeTenantId, email, targetTenantId, roleCode } = parsed.data;

  if (homeTenantId === targetTenantId)
    return { ok: false, error: 'Le site cible doit être différent du site « home ».' };

  // Les deux sites doivent appartenir au même groupe.
  const [home, target] = await Promise.all([
    prismaAdmin.tenant.findUnique({ where: { id: homeTenantId }, select: { groupId: true } }),
    prismaAdmin.tenant.findUnique({ where: { id: targetTenantId }, select: { groupId: true, name: true } }),
  ]);
  if (!home?.groupId || home.groupId !== target?.groupId)
    return { ok: false, error: 'Les deux établissements doivent être dans le même groupe.' };

  const user = await prismaAdmin.user.findFirst({
    where: { tenantId: homeTenantId, email },
    select: { id: true },
  });
  if (!user) return { ok: false, error: 'Aucun compte avec cet email dans le site « home ».' };

  const role = await prismaAdmin.role.findUnique({
    where: { tenantId_code: { tenantId: targetTenantId, code: roleCode } },
    select: { id: true },
  });
  if (!role) return { ok: false, error: `Rôle « ${roleCode} » introuvable dans le site cible.` };

  await prismaAdmin.userTenant.upsert({
    where: { userId_tenantId: { userId: user.id, tenantId: targetTenantId } },
    create: { userId: user.id, tenantId: targetTenantId },
    update: {},
  });
  await prismaAdmin.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    create: { tenantId: targetTenantId, userId: user.id, roleId: role.id },
    update: {},
  });

  revalidatePath('/super-admin/groups');
  return { ok: true, message: `Accès accordé à ${email} sur « ${target?.name} » (${roleCode}).` };
}

/**
 * Retire l'accès d'un compte à un site : supprime le lien UserTenant + tous ses
 * UserRole dans ce site. Le site « home » du compte ne peut pas être retiré.
 */
export async function revokeSiteAccessAction(userId: string, tenantId: string): Promise<Result> {
  if (!(await requireSuperAdmin())) return { ok: false, error: 'Non autorisé.' };
  const user = await prismaAdmin.user.findUnique({ where: { id: userId }, select: { tenantId: true } });
  if (!user) return { ok: false, error: 'Compte introuvable.' };
  if (user.tenantId === tenantId)
    return { ok: false, error: 'Impossible de retirer le site « home » du compte.' };

  await prismaAdmin.userRole.deleteMany({ where: { userId, tenantId } });
  await prismaAdmin.userTenant.deleteMany({ where: { userId, tenantId } });

  revalidatePath('/super-admin/groups');
  return { ok: true, message: 'Accès retiré.' };
}
