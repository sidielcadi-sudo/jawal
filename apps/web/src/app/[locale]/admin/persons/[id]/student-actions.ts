'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant, prismaAdmin } from '@/lib/db';
import { safeSendEmail } from '@/lib/email';
import { ensureStudentAccess } from '@/lib/student-access';

type Result =
  | { ok: true; data: { email: string; tempPassword: string } }
  | { ok: false; error: string };

const schema = z.object({
  personId: z.string().uuid(),
  email: z.string().email().toLowerCase().optional().or(z.literal('')),
});

/**
 * Crée un accès au portail élève pour une personne de type STUDENT :
 * compte User + rôle `eleve` + lien UserPerson. Renvoie un mot de passe
 * temporaire à transmettre à l'élève (affiché une seule fois).
 */
export async function createStudentAccessAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('users.write');

  const parsed = schema.safeParse({
    personId: formData.get('personId'),
    email: (formData.get('email') as string | null)?.trim() ?? '',
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  const tenantId = session.user.tenantId;

  try {
    const { email, tempPassword } = await withTenant(tenantId, async (tx) => {
      const person = await tx.person.findUnique({ where: { id: parsed.data.personId } });
      if (!person || person.type !== 'STUDENT') throw new Error('Élève introuvable');

      const existing = await tx.userPerson.findFirst({ where: { personId: person.id } });
      if (existing) throw new Error('ALREADY_EXISTS');

      const res = await ensureStudentAccess(tx, tenantId, person, parsed.data.email);
      if (!res.ok) {
        if (res.reason === 'NO_EMAIL') throw new Error('NO_EMAIL');
        throw new Error('Rôle « élève » introuvable');
      }

      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'create_student_access',
        entityType: 'User',
        entityId: person.id,
        after: { email: res.email, personId: person.id },
      });

      return { email: res.email, tempPassword: res.tempPassword! };
    });

    // Email d'invitation à l'élève (best-effort).
    const tenant = await prismaAdmin.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });
    const tenantName = tenant?.name ?? 'votre établissement';
    await safeSendEmail({
      to: email,
      subject: `Accès à l'espace élève — ${tenantName}`,
      html:
        `<p>Bonjour,</p>` +
        `<p>Un accès à l'espace élève de <strong>${tenantName}</strong> a été créé pour toi.</p>` +
        `<p>Identifiant : <strong>${email}</strong><br/>` +
        `Mot de passe temporaire : <strong>${tempPassword}</strong></p>` +
        `<p>Merci de le modifier après ta première connexion.</p>`,
      text:
        `Accès à l'espace élève — ${tenantName}\n` +
        `Identifiant : ${email}\nMot de passe temporaire : ${tempPassword}\n` +
        `Modifie-le après ta première connexion.`,
    });

    revalidatePath('/admin/persons');
    return { ok: true, data: { email, tempPassword } };
  } catch (e: unknown) {
    if (e instanceof Error) {
      if (e.message === 'ALREADY_EXISTS')
        return { ok: false, error: 'Un accès portail existe déjà pour cet élève.' };
      if (e.message === 'NO_EMAIL')
        return { ok: false, error: 'Aucun email : renseignez une adresse pour créer l’accès.' };
      if (e.message.includes('Unique constraint'))
        return { ok: false, error: 'Un compte existe déjà avec cet email pour cet établissement.' };
      return { ok: false, error: e.message };
    }
    throw e;
  }
}
