import { verifyMobileTeacher, unauthorized } from '@/lib/mobile-teacher';
import { reopenTeacherAppel } from '@/lib/teacher-appel-save';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ entryId: string; date: string }> };

/**
 * POST /api/mobile/teacher/appel/[entryId]/[date]/reopen
 * Body : { sessionId }
 * → déverrouille une feuille d'appel validée, comme le bouton du portail web.
 */
export async function POST(req: Request, ctx: Ctx) {
  const principal = await verifyMobileTeacher(req);
  if (!principal) return unauthorized();
  const { entryId } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }
  const sessionId = (body as { sessionId?: unknown }).sessionId;
  if (typeof sessionId !== 'string' || !sessionId) {
    return Response.json({ error: 'Séance manquante.' }, { status: 400 });
  }

  const res = await reopenTeacherAppel(principal.tenantId, principal.userId, sessionId, entryId);
  if (!res.ok) return Response.json({ error: res.error }, { status: 400 });
  return Response.json({ ok: true });
}
