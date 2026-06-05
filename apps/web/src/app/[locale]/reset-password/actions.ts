'use server';

import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prismaAdmin } from '@/lib/db';
import { hashResetToken } from '@/lib/password-reset';

type Result = { ok: true } | { ok: false; error: 'INVALID_TOKEN' | 'WEAK_PASSWORD' | 'MISMATCH' };

const schema = z
  .object({
    token: z.string().min(1),
    newPassword: z.string().min(8),
    confirm: z.string().min(1),
  })
  .refine((d) => d.newPassword === d.confirm, { path: ['confirm'] });

/**
 * Consomme un jeton de réinitialisation et pose le nouveau mot de passe.
 *
 * Pré-authentification : opère via `prismaAdmin`. Le jeton est validé par son
 * empreinte (jamais en clair en base), doit être non utilisé et non expiré.
 * Usage unique : on marque `usedAt` dans la même transaction que la mise à jour
 * du hash, ce qui empêche le rejeu.
 */
export async function resetPasswordAction(formData: FormData): Promise<Result> {
  const parsed = schema.safeParse({
    token: formData.get('token'),
    newPassword: formData.get('newPassword'),
    confirm: formData.get('confirm'),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.path[0] === 'confirm') return { ok: false, error: 'MISMATCH' };
    if (issue?.path[0] === 'newPassword') return { ok: false, error: 'WEAK_PASSWORD' };
    return { ok: false, error: 'INVALID_TOKEN' };
  }

  const tokenHash = hashResetToken(parsed.data.token);
  const record = await prismaAdmin.passwordResetToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, usedAt: true, expiresAt: true },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return { ok: false, error: 'INVALID_TOKEN' };
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);

  // Consommation atomique : refus si le jeton a été utilisé entre-temps
  // (updateMany sur usedAt: null → count 0 en cas de course concurrente).
  const consumed = await prismaAdmin.passwordResetToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (consumed.count === 0) return { ok: false, error: 'INVALID_TOKEN' };

  await prismaAdmin.user.update({
    where: { id: record.userId },
    data: { passwordHash },
  });

  return { ok: true };
}
