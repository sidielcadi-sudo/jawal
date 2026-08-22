import { withTenant } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';
import { loadParentChildContext } from '@/lib/parent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DOW_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * GET /api/mobile/children/[childId]/timetable?date=YYYY-MM-DD
 * → cours de la journée pour la classe de l'enfant.
 *
 * Reprend exactement la vue « Aujourd'hui » du portail parent : créneau,
 * matière, professeur, salle, plus les modifications **approuvées** du jour
 * (cours annulé, ou professeur remplaçant). Sans `date`, la journée courante.
 */
export async function GET(req: Request, ctx: { params: Promise<{ childId: string }> }) {
  const { childId } = await ctx.params;
  const principal = await verifyMobileToken(req);
  if (!principal) return Response.json({ error: 'Non authentifié.' }, { status: 401 });

  const url = new URL(req.url);
  const raw = url.searchParams.get('date');
  const date = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : ymd(new Date());

  const data = await withTenant(principal.tenantId, async (tx) => {
    const child = await loadParentChildContext(tx, principal.userId, childId);
    if (!child) return 'forbidden' as const;
    if (!child.classId || !child.year) return { date, className: null, courses: [] };

    const dayCode = DOW_CODES[new Date(`${date}T00:00:00.000Z`).getUTCDay()]!;
    const entries = await tx.timetableEntry.findMany({
      where: { classId: child.classId, academicYearId: child.year.id, dayOfWeek: dayCode },
      include: {
        slot: { select: { startTime: true, endTime: true, order: true, isBreak: true } },
        subject: { select: { label: true } },
        teacher: { select: { firstName: true, lastName: true } },
        room: { select: { label: true, code: true } },
      },
      orderBy: { slot: { order: 'asc' } },
    });

    const overrides = entries.length
      ? await tx.timetableOverride.findMany({
          where: {
            entryId: { in: entries.map((e) => e.id) },
            date: new Date(`${date}T00:00:00.000Z`),
            approvalStatus: 'APPROVED',
          },
          include: { substituteTeacher: { select: { firstName: true, lastName: true } } },
        })
      : [];
    const byEntry = new Map(overrides.map((o) => [o.entryId, o]));

    return {
      date,
      className: child.className ?? null,
      courses: entries.map((e) => {
        const ov = byEntry.get(e.id);
        return {
          id: e.id,
          startTime: e.slot.startTime,
          endTime: e.slot.endTime,
          subject: e.subject?.label ?? null,
          teacher: e.teacher ? `${e.teacher.lastName} ${e.teacher.firstName}` : null,
          room: e.room?.label ?? e.room?.code ?? null,
          isBreak: e.slot.isBreak,
          cancelled: ov?.kind === 'CANCELLED',
          substituteName:
            ov?.kind === 'SUBSTITUTION' && ov.substituteTeacher
              ? `${ov.substituteTeacher.lastName} ${ov.substituteTeacher.firstName}`
              : null,
        };
      }),
    };
  });

  if (data === 'forbidden') return Response.json({ error: 'Accès refusé.' }, { status: 403 });
  return Response.json(data);
}
