import 'server-only';
import { verifyMobileToken, type MobilePrincipal } from '@/lib/mobile-auth';

/**
 * Vérifie qu'une requête mobile porte bien un jeton d'**enseignant**.
 *
 * Le rôle est scellé dans le jeton à la connexion : un compte parent ne peut
 * pas atteindre les écrans profs en devinant une URL, et l'inverse est vrai
 * pour les routes parents, dont les gardes reposent déjà sur le rattachement
 * aux enfants.
 */
export async function verifyMobileTeacher(req: Request): Promise<MobilePrincipal | null> {
  const principal = await verifyMobileToken(req);
  return principal?.role === 'teacher' ? principal : null;
}

/** Réponse 401/403 standard des routes enseignant. */
export const unauthorized = () =>
  Response.json({ error: 'Accès réservé aux comptes enseignants.' }, { status: 401 });
