import { withTenant } from '@/lib/db';
import { verifyMobileTeacher, unauthorized } from '@/lib/mobile-teacher';
import { getTeacherPersonId } from '@/lib/teacher';
import { getTeacherAnnouncements } from '@/lib/teacher-announcements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Fenêtre par défaut de l'accueil mobile : le dernier mois. */
const DEFAULT_DAYS = 30;

/**
 * GET /api/mobile/teacher/announcements?days=30
 * → annonces dont le professeur est destinataire, limitées à la fenêtre
 *   demandée (`days=0` pour tout l'historique).
 */
export async function GET(req: Request) {
  const principal = await verifyMobileTeacher(req);
  if (!principal) return unauthorized();

  const raw = new URL(req.url).searchParams.get('days');
  const days = raw === null ? DEFAULT_DAYS : Number(raw);
  const since =
    Number.isFinite(days) && days > 0
      ? new Date(Date.now() - days * 86_400_000)
      : undefined;

  const items = await withTenant(principal.tenantId, async (tx) => {
    const teacherId = await getTeacherPersonId(tx, principal.userId);
    if (!teacherId) return [];
    const anns = await getTeacherAnnouncements(tx, teacherId, { since, limit: 50 });
    return anns.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      publishedAt: a.publishedAt,
      audience: a.audience,
    }));
  });

  return Response.json({ items });
}
