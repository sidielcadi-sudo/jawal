import { authenticateMobileUser, signMobileToken } from '@/lib/mobile-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/mobile/auth/login
 * Body JSON : { tenantSlug, email, password }
 * → { token, user: { id, role } }  (JWT porteur, valable 30 j)
 *   `role` vaut 'parent' ou 'teacher' : l'app ouvre l'espace correspondant.
 */
export async function POST(req: Request) {
  let body: { tenantSlug?: string; email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }

  const res = await authenticateMobileUser(body.tenantSlug ?? '', body.email ?? '', body.password ?? '');
  if (!res.ok) return Response.json({ error: res.error }, { status: 401 });

  const token = await signMobileToken(res.principal);
  return Response.json({ token, user: { id: res.principal.userId, role: res.principal.role } });
}
