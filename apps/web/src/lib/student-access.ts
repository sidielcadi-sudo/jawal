import 'server-only';
import bcrypt from 'bcryptjs';
import type { Prisma } from '@/lib/db';
import { generateTempPassword } from '@/lib/parent-access';

type Tx = Prisma.TransactionClient;

export type EnsureStudentAccessResult =
  | { ok: true; email: string; tempPassword: string | null; created: boolean }
  | { ok: false; reason: 'NO_EMAIL' | 'NO_ROLE' };

/**
 * Garantit l'existence d'un accès portail élève pour une personne de type STUDENT.
 * - Si un `UserPerson` existe déjà : renvoie le login (`tempPassword: null`).
 * - Sinon : crée `User` (+ hash) + `UserPerson(relationship 'student')` +
 *   `UserRole('eleve')` et renvoie le mot de passe temporaire en clair.
 * À appeler dans un `withTenant`. Email = `emailOverride` sinon `contacts.email`.
 */
export async function ensureStudentAccess(
  tx: Tx,
  tenantId: string,
  person: { id: string; contacts: Prisma.JsonValue },
  emailOverride?: string,
): Promise<EnsureStudentAccessResult> {
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
    where: { tenantId_code: { tenantId, code: 'eleve' } },
  });
  if (!role) return { ok: false, reason: 'NO_ROLE' };

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const user = await tx.user.create({
    data: { tenantId, email, passwordHash, locale: 'fr' },
  });
  await tx.userPerson.create({
    data: { tenantId, userId: user.id, personId: person.id, relationship: 'student' },
  });
  await tx.userRole.create({ data: { tenantId, userId: user.id, roleId: role.id } });

  return { ok: true, email, tempPassword, created: true };
}
