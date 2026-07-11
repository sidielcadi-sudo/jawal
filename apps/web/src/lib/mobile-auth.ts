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

export type MobilePrincipal = { userId: string; tenantId: string };

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url');

export async function signMobileToken(p: MobilePrincipal): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ sub: p.userId, tenantId: p.tenantId, iat: now, exp: now + TOKEN_TTL_SECONDS }));
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
      exp?: number;
    };
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;
    if (typeof payload.sub !== 'string' || typeof payload.tenantId !== 'string') return null;
    return { userId: payload.sub, tenantId: payload.tenantId };
  } catch {
    return null;
  }
}

/**
 * Valide les identifiants d'un **parent** (établissement + email + mot de passe).
 * Réutilise la même logique que l'authorize web. Renvoie le principal, ou une
 * erreur explicite (générique pour ne pas divulguer d'info).
 */
export async function authenticateParent(
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

  // Réservé aux comptes parents (l'app mobile est le portail parent).
  const roles = await prismaAdmin.userRole.findMany({
    where: { userId: user.id },
    select: { role: { select: { code: true } } },
  });
  const isParent = !user.isSuperAdmin && roles.some((r) => r.role.code === 'parent');
  if (!isParent) return { ok: false, error: 'Ce compte n’est pas un compte parent.' };

  await prismaAdmin.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return { ok: true, principal: { userId: user.id, tenantId: tenant.id } };
}
