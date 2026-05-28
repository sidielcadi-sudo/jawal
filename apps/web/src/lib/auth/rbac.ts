import 'server-only';
import { cache } from 'react';
import { prismaAdmin } from '@jawal/db';
import { hasPermission } from '@jawal/shared';
import { auth } from './index';

/**
 * Charge les permissions effectives de l'utilisateur courant.
 * - Super-admin → wildcard '*'
 * - Sinon → union des permissions de tous ses rôles
 *
 * Mémoïsée par requête via React `cache`.
 */
export const currentUserPermissions = cache(async (): Promise<string[]> => {
  const session = await auth();
  if (!session?.user) return [];
  if (session.user.isSuperAdmin) return ['*'];

  // prismaAdmin volontaire : on doit lire les rôles côté serveur avant
  // d'avoir un contexte tenant établi (le user vient juste de s'authentifier).
  const userRoles = await prismaAdmin.userRole.findMany({
    where: { userId: session.user.id },
    include: { role: { select: { permissions: true } } },
  });

  const perms = new Set<string>();
  for (const ur of userRoles) {
    for (const p of ur.role.permissions) perms.add(p);
  }
  return Array.from(perms);
});

/**
 * Vérifie si l'utilisateur courant possède une permission.
 * Le `*` global et les wildcards `<module>.*` sont gérés.
 */
export async function can(permission: string): Promise<boolean> {
  const perms = await currentUserPermissions();
  return hasPermission(perms, permission);
}

/**
 * À utiliser dans les Server Components / Server Actions pour gater une
 * opération. Renvoie une `Error` "Forbidden" si la permission manque ;
 * laisser l'appelant la traduire en réponse 403 ou rediriger.
 */
export async function requirePermission(permission: string): Promise<void> {
  if (!(await can(permission))) {
    throw new Error(`Forbidden: missing permission "${permission}"`);
  }
}
