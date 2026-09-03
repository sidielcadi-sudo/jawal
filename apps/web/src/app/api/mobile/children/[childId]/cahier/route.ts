import { withTenant } from '@/lib/db';
import { verifyMobileParent } from '@/lib/mobile-auth';
import { loadParentChildContext } from '@/lib/parent';
import { getClassLessonBook, getClassUpcomingHomeworks } from '@/lib/lesson-book';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/mobile/children/[childId]/cahier
 * → cahier de texte : leçons récentes (30 j) + devoirs à venir.
 */
export async function GET(req: Request, ctx: { params: Promise<{ childId: string }> }) {
  const { childId } = await ctx.params;
  const principal = await verifyMobileParent(req);
  if (!principal) return Response.json({ error: 'Non authentifié.' }, { status: 401 });

  const data = await withTenant(principal.tenantId, async (tx) => {
    const child = await loadParentChildContext(tx, principal.userId, childId);
    if (!child) return 'forbidden' as const;
    if (!child.classId) return { lessons: [], homeworks: [] };
    const [lessonsRaw, homeworksRaw] = await Promise.all([
      getClassLessonBook(tx, child.classId, 30),
      getClassUpcomingHomeworks(tx, child.classId),
    ]);
    // DTO propres (pas d'objets Prisma bruts).
    const lessons = lessonsRaw.map((l) => ({
      id: l.id,
      date: l.date,
      title: l.title,
      summary: l.summary,
      subject: l.entry?.subject?.label ?? null,
      teacher: l.entry?.teacher ? `${l.entry.teacher.lastName} ${l.entry.teacher.firstName}` : null,
    }));
    const homeworks = homeworksRaw.map((h) => ({
      id: h.id,
      dueDate: h.dueDate,
      description: h.description,
      type: h.type,
      subject: h.lessonEntry?.entry?.subject?.label ?? null,
    }));
    return { lessons, homeworks };
  });

  if (data === 'forbidden') return Response.json({ error: 'Accès refusé.' }, { status: 403 });
  return Response.json(data);
}
