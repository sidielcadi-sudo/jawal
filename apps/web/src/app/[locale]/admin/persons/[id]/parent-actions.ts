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
  | { ok: true; data: { email: string; tempPassword: string } }
  | { ok: false; error: string };

const schema = z.object({
  personId: z.string().uuid(),
  email: z.string().email().toLowerCase().optional().or(z.literal('')),
});

function generateTempPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(10);
  let out = '';
  for (let i = 0; i < 10; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}

/**
 * Crée un accès au portail parent pour une personne de type PARENT :
 * compte User + rôle `parent` + lien UserPerson. Renvoie un mot de passe
 * temporaire à transmettre au parent (affiché une seule fois).
 */
export async function createParentAccessAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('users.write');

  const parsed = schema.safeParse({
    personId: formData.get('personId'),
    email: (formData.get('email') as string | null)?.trim() ?? '',
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  const tenantId = session.user.tenantId;
  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  try {
    const email = await withTenant(tenantId, async (tx) => {
      const person = await tx.person.findUnique({ where: { id: parsed.data.personId } });
      if (!person || person.type !== 'PARENT') throw new Error('Personne parent introuvable');

      const existing = await tx.userPerson.findFirst({
        where: { personId: person.id },
        include: { user: { select: { email: true, disabledAt: true } } },
      });
      if (existing) throw new Error('ALREADY_EXISTS');

      const contacts = (person.contacts ?? {}) as { email?: string };
      const email = parsed.data.email || contacts.email;
      if (!email) throw new Error('NO_EMAIL');

      const role = await tx.role.findUnique({
        where: { tenantId_code: { tenantId, code: 'parent' } },
      });
      if (!role) throw new Error('Rôle « parent » introuvable');

      const user = await tx.user.create({
        data: { tenantId, email, passwordHash, locale: 'fr' },
      });
      await tx.userPerson.create({
        data: { tenantId, userId: user.id, personId: person.id, relationship: 'parent' },
      });
      await tx.userRole.create({ data: { tenantId, userId: user.id, roleId: role.id } });

      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'create_parent_access',
        entityType: 'User',
        entityId: user.id,
        after: { email, personId: person.id },
      });

      return email;
    });

    revalidatePath('/admin/persons');
    return { ok: true, data: { email, tempPassword } };
  } catch (e: unknown) {
    if (e instanceof Error) {
      if (e.message === 'ALREADY_EXISTS')
        return { ok: false, error: 'Un accès portail existe déjà pour ce parent.' };
      if (e.message === 'NO_EMAIL')
        return { ok: false, error: 'Aucun email : renseignez une adresse pour créer l’accès.' };
      if (e.message.includes('Unique constraint'))
        return { ok: false, error: 'Un compte existe déjà avec cet email pour cet établissement.' };
      return { ok: false, error: e.message };
    }
    throw e;
  }
}
