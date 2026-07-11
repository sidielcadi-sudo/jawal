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
    // Scopé au site actif : un compte multi-sites a les permissions de la
    // session courante, pas l'union de tous ses établissements.
    where: { userId: session.user.id, tenantId: session.user.tenantId },
    include: { role: { select: { permissions: true } } },
  });

  const perms = new Set<string>();
  for (const ur of userRoles) {
    for (const p of ur.role.permissions) perms.add(p);
  }
  return Array.from(perms);
});

/**
 * Codes des rôles de l'utilisateur courant (ex. 'tenant_admin', 'direction',
 * 'cpe'). Sert au filtrage de la navigation et des tableaux de bord par rôle.
 * Mémoïsée par requête.
 */
export const currentUserRoleCodes = cache(async (): Promise<string[]> => {
  const session = await auth();
  if (!session?.user) return [];
  if (session.user.isSuperAdmin) return ['tenant_admin'];

  const userRoles = await prismaAdmin.userRole.findMany({
    where: { userId: session.user.id, tenantId: session.user.tenantId },
    include: { role: { select: { code: true } } },
  });
  return userRoles.map((ur) => ur.role.code);
});

/** True si l'utilisateur appartient à la direction (vue pilotage). */
export async function isDirection(): Promise<boolean> {
  const codes = await currentUserRoleCodes();
  return codes.includes('tenant_admin') || codes.includes('direction');
}

/**
 * Vérifie si l'utilisateur courant possède une permission.
 * Le `*` global et les wildcards `<module>.*` sont gérés.
 */
export async function can(permission: string): Promise<boolean> {
  const perms = await currentUserPermissions();
  return hasPermission(perms, permission);
}

/**
 * Erreur d'autorisation. Le `message` est directement présentable à
 * l'utilisateur (les Server Actions le renvoient tel quel dans `{ ok:false }`).
 * Le `digest` stable « FORBIDDEN » survit à la frontière serveur→client (même
 * en prod où le message est expurgé), ce qui permet à un error boundary de
 * reconnaître le cas et d'afficher « Opération non autorisée ».
 */
export class ForbiddenError extends Error {
  digest = 'FORBIDDEN';
  detail?: string;
  constructor(detail?: string) {
    super('Opération non autorisée.');
    this.name = 'ForbiddenError';
    this.detail = detail;
  }
}

/**
 * À utiliser dans les Server Components / Server Actions pour gater une
 * opération. Lève une `ForbiddenError` (message « Opération non autorisée. »)
 * si la permission manque.
 */
export async function requirePermission(permission: string): Promise<void> {
  if (!(await can(permission))) {
    throw new ForbiddenError(`missing permission "${permission}"`);
  }
}

/**
 * Gate une opération sur l'appartenance à un rôle précis (responsable d'étape
 * d'un workflow). `tenant_admin` (et super-admin, mappé sur `tenant_admin`)
 * passe toujours. Sert au verrouillage des étapes de radiation/remboursement,
 * où seul le responsable de l'étape peut valider.
 */
export async function requireRoleCode(codes: string[]): Promise<void> {
  const roles = await currentUserRoleCodes();
  if (!codes.some((c) => roles.includes(c))) {
    throw new ForbiddenError(`rôle requis (${codes.join(', ')})`);
  }
}
