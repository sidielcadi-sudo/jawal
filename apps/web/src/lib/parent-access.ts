import 'server-only';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import type { Prisma } from '@/lib/db';

type Tx = Prisma.TransactionClient;

/** Mot de passe temporaire lisible (sans caractères ambigus). */
export function generateTempPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(10);
  let out = '';
  for (let i = 0; i < 10; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}

export type EnsureParentAccessResult =
  | { ok: true; email: string; tempPassword: string | null; created: boolean }
  | { ok: false; reason: 'NO_EMAIL' | 'NO_ROLE' };

/**
 * Garantit l'existence d'un accès portail pour une personne de type PARENT.
 * - Si un `UserPerson` existe déjà : ne touche à rien, renvoie le login
 *   (`tempPassword: null`, `created: false`).
 * - Sinon : crée `User` (+ hash) + `UserPerson` + `UserRole(parent)` et renvoie
 *   le mot de passe temporaire en clair (à transmettre une seule fois).
 *
 * À appeler dans un `withTenant`. L'email est pris dans `emailOverride` sinon
 * dans `person.contacts.email`.
 */
export async function ensureParentAccess(
  tx: Tx,
  tenantId: string,
  person: { id: string; contacts: Prisma.JsonValue },
  emailOverride?: string,
): Promise<EnsureParentAccessResult> {
  const existing = await tx.userPerson.findFirst({
    where: { personId: person.id },
    include: { user: { select: { email: true } } },
  });
  if (existing) {
    return { ok: true, email: existing.user.email, tempPassword: null, created: false };
  }

  const contacts = (person.contacts ?? {}) as { email?: string };
  const email = (emailOverride || contacts.email || '').trim().toLowerCase();
  if (!email) return { ok: false, reason: 'NO_EMAIL' };

  const role = await tx.role.findUnique({
    where: { tenantId_code: { tenantId, code: 'parent' } },
  });
  if (!role) return { ok: false, reason: 'NO_ROLE' };

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const user = await tx.user.create({
    data: { tenantId, email, passwordHash, locale: 'fr' },
  });
  await tx.userPerson.create({
    data: { tenantId, userId: user.id, personId: person.id, relationship: 'parent' },
  });
  await tx.userRole.create({ data: { tenantId, userId: user.id, roleId: role.id } });

  return { ok: true, email, tempPassword, created: true };
}
