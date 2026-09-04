import { verifyMobileTeacher, unauthorized } from '@/lib/mobile-teacher';
import { createTeacherDevoir, teacherDevoirSchema } from '@/lib/teacher-devoir';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ classId: string; subjectId: string }> };

/**
 * POST /api/mobile/teacher/notes/[classId]/[subjectId]/devoirs
 * Body : { periodId, label, date, maxValue?, weight? }
 * → crée un devoir (évaluation) pour ce couple classe × matière.
 *
 * Passe par la même écriture que le portail web : le prof peut donc préparer
 * sa colonne de notes depuis le téléphone, sans repasser par l'ordinateur.
 */
export async function POST(req: Request, ctx: Ctx) {
  const principal = await verifyMobileTeacher(req);
  if (!principal) return unauthorized();
  const { classId, subjectId } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }

  const parsed = teacherDevoirSchema.safeParse({ ...(body as object), classId, subjectId });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return Response.json(
      { error: `Données invalides${first ? ` (${first.path.join('.')})` : ''}.` },
      { status: 400 },
    );
  }

  try {
    const id = await createTeacherDevoir(
      principal.tenantId,
      principal.userId,
      parsed.data,
      'mobile-teacher',
    );
    return Response.json({ ok: true, id });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 400 });
  }
}
