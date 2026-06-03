'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant, prismaAdmin } from '@/lib/db';
import { safeSendEmail } from '@/lib/email';

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
 * Crée un accès au portail enseignant pour une personne de type TEACHER :
 * compte User + rôle `enseignant` + lien UserPerson. Renvoie un mot de passe
 * temporaire (affiché une fois) et l'envoie par email.
 */
export async function createTeacherAccessAction(formData: FormData): Promise<Result> {
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
      if (!person || person.type !== 'TEACHER') throw new Error('Personne enseignant introuvable');

      const existing = await tx.userPerson.findFirst({ where: { personId: person.id } });
      if (existing) throw new Error('ALREADY_EXISTS');

      const contacts = (person.contacts ?? {}) as { email?: string };
      const email = parsed.data.email || contacts.email;
      if (!email) throw new Error('NO_EMAIL');

      const role = await tx.role.findUnique({
        where: { tenantId_code: { tenantId, code: 'enseignant' } },
      });
      if (!role) throw new Error('Rôle « enseignant » introuvable');

      const user = await tx.user.create({ data: { tenantId, email, passwordHash, locale: 'fr' } });
      await tx.userPerson.create({
        data: { tenantId, userId: user.id, personId: person.id, relationship: 'self' },
      });
      await tx.userRole.create({ data: { tenantId, userId: user.id, roleId: role.id } });

      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'create_teacher_access',
        entityType: 'User',
        entityId: user.id,
        after: { email, personId: person.id },
      });
      return email;
    });

    const tenant = await prismaAdmin.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
    const tenantName = tenant?.name ?? 'votre établissement';
    await safeSendEmail({
      to: email,
      subject: `Accès à l'espace enseignant — ${tenantName}`,
      html:
        `<p>Bonjour,</p>` +
        `<p>Un accès à l'espace enseignant de <strong>${tenantName}</strong> a été créé pour vous.</p>` +
        `<p>Identifiant : <strong>${email}</strong><br/>Mot de passe temporaire : <strong>${tempPassword}</strong></p>` +
        `<p>Merci de le modifier après votre première connexion.</p>`,
      text:
        `Accès à l'espace enseignant — ${tenantName}\nIdentifiant : ${email}\n` +
        `Mot de passe temporaire : ${tempPassword}\nModifiez-le après votre première connexion.`,
    });

    revalidatePath('/admin/persons');
    return { ok: true, data: { email, tempPassword } };
  } catch (e: unknown) {
    if (e instanceof Error) {
      if (e.message === 'ALREADY_EXISTS')
        return { ok: false, error: 'Un accès portail existe déjà pour cet enseignant.' };
      if (e.message === 'NO_EMAIL')
        return { ok: false, error: 'Aucun email : renseignez une adresse pour créer l’accès.' };
      if (e.message.includes('Unique constraint'))
        return { ok: false, error: 'Un compte existe déjà avec cet email pour cet établissement.' };
      return { ok: false, error: e.message };
    }
    throw e;
  }
}
