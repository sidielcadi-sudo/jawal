'use server';

import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';

type Result = { ok: true } | { ok: false; error: string };

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Mot de passe actuel requis.'),
    newPassword: z.string().min(8, 'Au moins 8 caractères.'),
    confirm: z.string().min(1),
  })
  .refine((d) => d.newPassword === d.confirm, {
    message: 'La confirmation ne correspond pas.',
    path: ['confirm'],
  });

/** Changement de mot de passe par l'enseignant lui-même. */
export async function changeTeacherPasswordAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  if (!session.user.isTeacher) return { ok: false, error: 'Réservé aux comptes enseignant.' };

  const parsed = schema.safeParse({
    currentPassword: formData.get('currentPassword'),
    newPassword: formData.get('newPassword'),
    confirm: formData.get('confirm'),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  const userId = session.user.id;
  return withTenant(session.user.tenantId, async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    if (!user?.passwordHash) return { ok: false, error: 'Compte sans mot de passe.' };
    const ok = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
    if (!ok) return { ok: false, error: 'Mot de passe actuel incorrect.' };
    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
    await tx.user.update({ where: { id: userId }, data: { passwordHash } });
    return { ok: true };
  });
}
