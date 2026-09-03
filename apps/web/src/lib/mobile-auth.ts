import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prismaAdmin } from '@jawal/db';

/**
 * Authentification de l'API mobile (app parent React Native). Contrairement au
 * web (sessions NextAuth par cookies), le mobile utilise un **JWT porteur**
 * (Authorization: Bearer …). Le token encode `sub` = userId et `tenantId` ;
 * chaque endpoint le vérifie puis exécute la requête sous `withTenant` (RLS).
 * JWT HS256 implémenté avec `node:crypto` (pas de dépendance externe).
 */

const secretKey = () => process.env.AUTH_SECRET ?? 'dev-secret-change-me';
const TOKEN_TTL_SECONDS = 30 * 24 * 3600; // 30 jours

/** Espace ouvert à l'app mobile selon le rôle du compte. */
export type MobileRole = 'parent' | 'teacher';

export type MobilePrincipal = { userId: string; tenantId: string; role: MobileRole };

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url');

export async function signMobileToken(p: MobilePrincipal): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({ sub: p.userId, tenantId: p.tenantId, role: p.role, iat: now, exp: now + TOKEN_TTL_SECONDS }),
  );
  const data = `${header}.${payload}`;
  const sig = createHmac('sha256', secretKey()).update(data).digest('base64url');
  return `${data}.${sig}`;
}

/** Vérifie le Bearer token d'une requête → principal, ou null si absent/invalide. */
export async function verifyMobileToken(req: Request): Promise<MobilePrincipal | null> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, b, s] = parts;
  try {
    const expected = createHmac('sha256', secretKey()).update(`${h}.${b}`).digest('base64url');
    const a = Buffer.from(s!);
    const e = Buffer.from(expected);
    if (a.length !== e.length || !timingSafeEqual(a, e)) return null;
    const payload = JSON.parse(Buffer.from(b!, 'base64url').toString('utf8')) as {
      sub?: string;
      tenantId?: string;
      role?: string;
      exp?: number;
    };
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;
    if (typeof payload.sub !== 'string' || typeof payload.tenantId !== 'string') return null;
    // Jetons émis avant l'ouverture de l'espace enseignant : pas de `role`.
    // Ils restent valides et désignent un parent, sans quoi tous les parents
    // déjà connectés seraient déconnectés à la mise à jour.
    const role: MobileRole = payload.role === 'teacher' ? 'teacher' : 'parent';
    return { userId: payload.sub, tenantId: payload.tenantId, role };
  } catch {
    return null;
  }
}

/**
 * Valide les identifiants d'un compte mobile (établissement + email + mot de
 * passe) et détermine l'espace à ouvrir : **parent** ou **enseignant**.
 * Réutilise la même logique que l'authorize web. Renvoie le principal, ou une
 * erreur explicite (générique pour ne pas divulguer d'info).
 *
 * Un compte cumulant les deux rôles (un prof dont l'enfant est scolarisé ici)
 * ouvre l'espace enseignant : c'est son usage professionnel quotidien, et le
 * suivi de son enfant reste accessible sur le portail web.
 */
export async function authenticateMobileUser(
  tenantSlug: string,
  email: string,
  password: string,
): Promise<{ ok: true; principal: MobilePrincipal } | { ok: false; error: string }> {
  const slug = tenantSlug?.trim();
  const mail = email?.trim().toLowerCase();
  if (!slug || !mail || !password) return { ok: false, error: 'Champs manquants.' };

  const tenant = await prismaAdmin.tenant.findUnique({ where: { slug } });
  if (!tenant || tenant.status !== 'ACTIVE') return { ok: false, error: 'Identifiants invalides.' };

  const user = await prismaAdmin.user.findFirst({
    where: { email: mail, tenantId: tenant.id, disabledAt: null },
  });
  if (!user?.passwordHash) return { ok: false, error: 'Identifiants invalides.' };
  if (!(await bcrypt.compare(password, user.passwordHash))) return { ok: false, error: 'Identifiants invalides.' };

  const roles = await prismaAdmin.userRole.findMany({
    where: { userId: user.id },
    select: { role: { select: { code: true } } },
  });
  const codes = new Set(roles.map((r) => r.role.code));

  // L'espace enseignant suppose une fiche Person de type TEACHER : sans elle,
  // aucun écran du portail prof n'a de données à afficher.
  const teacherLink = codes.has('enseignant')
    ? await prismaAdmin.userPerson.findFirst({
        where: { userId: user.id, person: { type: 'TEACHER' } },
        select: { personId: true },
      })
    : null;

  const role: MobileRole | null = teacherLink ? 'teacher' : codes.has('parent') ? 'parent' : null;
  if (user.isSuperAdmin || !role) {
    return { ok: false, error: 'Ce compte n’a pas accès à l’application mobile.' };
  }

  await prismaAdmin.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return { ok: true, principal: { userId: user.id, tenantId: tenant.id, role } };
}

/**
 * Vérifie qu'une requête mobile porte un jeton de **parent**.
 *
 * Pendant de `verifyMobileTeacher` : chaque espace ne voit que ses propres
 * routes. Les gardes métier (rattachement aux enfants) restent en place — ceci
 * n'est que la première barrière, celle qui évite qu'un compte se promène dans
 * l'API de l'autre espace.
 */
export async function verifyMobileParent(req: Request): Promise<MobilePrincipal | null> {
  const principal = await verifyMobileToken(req);
  return principal?.role === 'parent' ? principal : null;
}
