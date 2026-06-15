'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';

type Result =
  | { ok: true; data?: { email: string; tempPassword: string } }
  | { ok: false; error: string };

const inviteSchema = z.object({
  email: z.string().email().toLowerCase(),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  personType: z.enum(['TEACHER', 'STAFF']),
  roleCode: z.string().min(1).max(60),
  // Type de personnel (PersonRole du paramétrage) — optionnel.
  personRoleId: z.preprocess((v) => (v === '' ? undefined : v), z.string().uuid().optional()),
});

function input(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' ? v.trim() : '';
  };
  return {
    email: get('email'),
    firstName: get('firstName'),
    lastName: get('lastName'),
    personType: get('personType'),
    roleCode: get('roleCode'),
    personRoleId: get('personRoleId'),
  };
}

function generateTempPassword(): string {
  // 10 caractères alphanumériques sans ambiguïtés (l, 1, I, O, 0)
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(10);
  let out = '';
  for (let i = 0; i < 10; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}

export async function inviteUserAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('users.write');

  const parsed = inviteSchema.safeParse(input(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  const tenantId = session.user.tenantId;
  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  try {
    await withTenant(tenantId, async (tx) => {
      const role = await tx.role.findUnique({
        where: { tenantId_code: { tenantId, code: parsed.data.roleCode } },
      });
      if (!role) throw new Error(`Rôle introuvable : ${parsed.data.roleCode}`);

      // Type de personnel (PersonRole) optionnel : doit correspondre au type choisi.
      let personRoleId: string | null = null;
      let serviceId: string | null = null;
      if (parsed.data.personRoleId) {
        const pr = await tx.personRole.findFirst({
          where: { id: parsed.data.personRoleId, appliesTo: parsed.data.personType },
          select: { id: true, serviceId: true },
        });
        if (!pr) throw new Error('Type de personnel invalide pour ce type de compte.');
        personRoleId = pr.id;
        serviceId = pr.serviceId;
      }

      const user = await tx.user.create({
        data: {
          tenantId,
          email: parsed.data.email,
          passwordHash,
          locale: 'fr',
        },
      });

      const person = await tx.person.create({
        data: {
          tenantId,
          type: parsed.data.personType,
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          contacts: { email: parsed.data.email },
          roleId: personRoleId,
          serviceId,
        },
      });

      await tx.userPerson.create({
        data: { tenantId, userId: user.id, personId: person.id, relationship: 'self' },
      });

      await tx.userRole.create({
        data: { tenantId, userId: user.id, roleId: role.id },
      });

      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'invite',
        entityType: 'User',
        entityId: user.id,
        after: { email: user.email, personType: parsed.data.personType, role: role.code },
      });
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('Unique constraint')) {
      return { ok: false, error: 'Un compte existe déjà avec cet email pour cet établissement.' };
    }
    throw e;
  }

  revalidatePath('/admin/settings/users');
  return { ok: true, data: { email: parsed.data.email, tempPassword } };
}

export async function disableUserAction(userId: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('users.write');
  if (userId === session.user.id) return { ok: false, error: 'On ne peut pas se désactiver soi-même.' };

  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    const before = await tx.user.findUnique({ where: { id: userId } });
    if (!before) throw new Error('Utilisateur introuvable');
    await tx.user.update({ where: { id: userId }, data: { disabledAt: new Date() } });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'disable',
      entityType: 'User',
      entityId: userId,
      before: { email: before.email, disabledAt: before.disabledAt },
    });
  });

  revalidatePath('/admin/settings/users');
  return { ok: true };
}

/**
 * Supprime définitivement un compte **inutilisé** (jamais connecté ou déjà
 * désactivé). Refuse : soi-même, un super-admin, ou un compte actif déjà utilisé
 * (le désactiver d'abord). La personne liée (Person) n'est PAS supprimée.
 */
export async function deleteUserAction(userId: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('users.write');
  if (userId === session.user.id) return { ok: false, error: 'On ne peut pas se supprimer soi-même.' };

  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const u = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, isSuperAdmin: true, disabledAt: true, lastLoginAt: true },
      });
      if (!u) throw new Error('Utilisateur introuvable');
      if (u.isSuperAdmin) throw new Error('Compte super-administrateur protégé.');
      if (!u.disabledAt && u.lastLoginAt) {
        throw new Error('Ce compte est actif et déjà utilisé. Désactivez-le avant de le supprimer.');
      }
      await tx.user.delete({ where: { id: userId } });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'delete',
        entityType: 'User',
        entityId: userId,
        before: { email: u.email },
      });
    });
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Suppression impossible.' };
  }
  revalidatePath('/admin/settings/users');
  return { ok: true };
}

export async function enableUserAction(userId: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('users.write');

  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { disabledAt: null } });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'enable',
      entityType: 'User',
      entityId: userId,
    });
  });

  revalidatePath('/admin/settings/users');
  return { ok: true };
}
