'use server';

import { z } from 'zod';
import { prismaAdmin } from '@/lib/db';
import { safeSendEmail } from '@/lib/email';
import { RESET_TOKEN_TTL_MS, generateResetToken, hashResetToken } from '@/lib/password-reset';

type Result = { ok: true } | { ok: false; error: string };

const schema = z.object({
  email: z.string().email().toLowerCase(),
  tenantSlug: z.string().trim().min(1),
  locale: z.enum(['fr', 'ar']).catch('fr'),
});

/**
 * Demande de réinitialisation (flux « mot de passe oublié »).
 *
 * Pré-authentification : on traverse les tenants via `prismaAdmin` (comme le
 * provider de login). Ouvert à **tous les comptes** du tenant (admin, personnel,
 * enseignant, parent, élève…) — plus de restriction au rôle parent.
 *
 * Anti-énumération : on renvoie toujours `{ ok: true }`, que l'adresse existe
 * ou non. Aucun signal ne permet de distinguer un email connu d'un inconnu.
 */
export async function requestParentPasswordResetAction(formData: FormData): Promise<Result> {
  const parsed = schema.safeParse({
    email: formData.get('email'),
    tenantSlug: formData.get('tenantSlug'),
    locale: formData.get('locale'),
  });
  // Entrée malformée (email/slug manquant) : seul cas d'erreur explicite.
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const { email, tenantSlug, locale } = parsed.data;

  const tenant = await prismaAdmin.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, name: true, status: true },
  });

  // Tenant inconnu/inactif : réponse générique (pas de fuite d'existence).
  if (tenant && tenant.status === 'ACTIVE') {
    const user = await prismaAdmin.user.findFirst({
      where: { email, tenantId: tenant.id, disabledAt: null },
      select: { id: true, email: true },
    });

    if (user) {
      const rawToken = generateResetToken();
      const tokenHash = hashResetToken(rawToken);
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

      // On invalide les jetons en attente du même compte, puis on émet le neuf.
      await prismaAdmin.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      await prismaAdmin.passwordResetToken.create({
        data: { tenantId: tenant.id, userId: user.id, tokenHash, expiresAt },
      });

      const baseUrl = process.env.APP_URL ?? 'http://localhost:3000';
      const link = `${baseUrl}/${locale}/reset-password?token=${rawToken}`;
      const tenantName = tenant.name;

      await safeSendEmail({
        to: user.email,
        subject: `Réinitialisation de votre mot de passe — ${tenantName}`,
        html:
          `<p>Bonjour,</p>` +
          `<p>Vous avez demandé à réinitialiser le mot de passe de votre compte ` +
          `<strong>${tenantName}</strong>.</p>` +
          `<p><a href="${link}">Cliquez ici pour choisir un nouveau mot de passe</a>. ` +
          `Ce lien est valable 1 heure et ne peut servir qu'une fois.</p>` +
          `<p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail : ` +
          `votre mot de passe reste inchangé.</p>`,
        text:
          `Réinitialisation de votre mot de passe — ${tenantName}\n\n` +
          `Ouvrez ce lien (valable 1 heure, usage unique) :\n${link}\n\n` +
          `Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.`,
      });
    }
  }

  return { ok: true };
}
