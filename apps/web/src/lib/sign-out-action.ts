'use server';

import { signOut } from '@/lib/auth';

/**
 * Déconnexion via server action (fiable en Auth.js v5, contrairement au
 * `signOut` client qui dépend d'un SessionProvider). Redirige vers le login
 * de la locale courante.
 */
export async function signOutAction(formData: FormData) {
  const locale = (formData.get('locale') as string) || 'fr';
  await signOut({ redirectTo: `/${locale}/login` });
}
