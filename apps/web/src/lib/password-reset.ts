import 'server-only';
import { createHash, randomBytes } from 'node:crypto';

/**
 * Helpers du flux « mot de passe oublié ».
 *
 * Le jeton transmis dans le lien e-mail est aléatoire (32 octets). En base on
 * ne stocke que son empreinte SHA-256 : une fuite de la table ne permet donc
 * pas de forger un lien valide. Le jeton est à usage unique et expire vite.
 */

/** Durée de validité d'un lien de réinitialisation (1 heure). */
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/** Génère un jeton en clair (à mettre dans le lien) — non stocké tel quel. */
export function generateResetToken(): string {
  return randomBytes(32).toString('hex');
}

/** Empreinte stockée en base ; déterministe pour retrouver le jeton au reset. */
export function hashResetToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
