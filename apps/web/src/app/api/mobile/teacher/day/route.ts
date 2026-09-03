import { withTenant } from '@/lib/db';
import { verifyMobileTeacher, unauthorized } from '@/lib/mobile-teacher';
import { getTeacherPersonId } from '@/lib/teacher';
import { getTeacherWeekAppel } from '@/lib/teacher-attendance';
import { mondayOf, toDateStr } from '@/lib/lesson-book';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/mobile/teacher/day?date=YYYY-MM-DD
 * → journée du professeur : ses cours, avec l'état de l'appel pour chacun.
 *
 * Une seule source (`getTeacherWeekAppel`) alimente l'emploi du temps et la
 * liste des appels : sur mobile les deux ne font qu'un écran, et le prof veut
 * voir d'un coup d'œil quel cours n'a pas encore son appel.
 */
export async function GET(req: Request) {
  const principal = await verifyMobileTeacher(req);
  if (!principal) return unauthorized();

  const url = new URL(req.url);
  const raw = url.searchParams.get('date') ?? '';
  const date = ISO_DATE.test(raw) ? raw : toDateStr(new Date());

  const sessions = await withTenant(principal.tenantId, async (tx) => {
    const teacherId = await getTeacherPersonId(tx, principal.userId);
    if (!teacherId) return null;
    const week = await getTeacherWeekAppel(tx, teacherId, mondayOf(date));
    return week.sessions.filter((s) => s.date === date);
  });

  if (sessions === null) return Response.json({ error: 'Profil enseignant introuvable.' }, { status: 404 });
  return Response.json({ date, sessions });
}
