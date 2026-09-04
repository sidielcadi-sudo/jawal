import { withTenant } from '@/lib/db';
import { verifyMobileTeacher, unauthorized } from '@/lib/mobile-teacher';
import { getTeacherPersonId } from '@/lib/teacher';
import { loadTeacherAppel } from '@/lib/teacher-attendance';
import { appelPayloadSchema, saveTeacherAppel } from '@/lib/teacher-appel-save';
import { personDisplayName } from '@/lib/localized-name';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type Ctx = { params: Promise<{ entryId: string; date: string }> };

/**
 * GET /api/mobile/teacher/appel/[entryId]/[date]
 * → feuille d'appel d'une séance : élèves, état déjà saisi, motifs de retard.
 *   Rien n'est écrit à l'ouverture (pas de brouillon fantôme).
 */
export async function GET(req: Request, ctx: Ctx) {
  const principal = await verifyMobileTeacher(req);
  if (!principal) return unauthorized();
  const { entryId, date } = await ctx.params;
  if (!ISO_DATE.test(date)) return Response.json({ error: 'Date invalide.' }, { status: 400 });

  const data = await withTenant(principal.tenantId, async (tx) => {
    const teacherId = await getTeacherPersonId(tx, principal.userId);
    if (!teacherId) return null;
    const detail = await loadTeacherAppel(tx, teacherId, entryId, date);
    if (!detail) return null;
    const reasons = await tx.attendanceReason.findMany({
      where: { active: true },
      orderBy: [{ order: 'asc' }, { label: 'asc' }],
      select: { id: true, label: true, color: true },
    });
    return {
      sessionId: detail.sessionId,
      finalized: detail.finalizedAt !== null,
      date: detail.date,
      className: detail.className,
      subject: detail.subject,
      room: detail.room,
      slotStart: detail.slotStart,
      slotEnd: detail.slotEnd,
      reasons,
      rows: detail.rows.map((r) => ({
        studentId: r.studentId,
        name: personDisplayName('fr', r),
        status: r.status,
        lateMinutes: r.lateMinutes,
        lateReasonId: r.lateReasonId,
        infirmary: r.infirmary,
        punishment: r.punishment,
        exclusion: r.exclusion,
        note: r.note,
        observation: r.observation,
        observationVisible: r.observationVisible,
        encouragement: r.encouragement,
        encouragementVisible: r.encouragementVisible,
      })),
    };
  });

  if (!data) return Response.json({ error: 'Séance introuvable ou non autorisée.' }, { status: 404 });
  return Response.json(data);
}

/**
 * POST /api/mobile/teacher/appel/[entryId]/[date]
 * Body : { finalize, records: [{ studentId, status, ... }] }
 *
 * Passe par la même écriture que le portail web : carnet, file Vie scolaire et
 * notification des parents restent identiques quel que soit le support.
 */
export async function POST(req: Request, ctx: Ctx) {
  const principal = await verifyMobileTeacher(req);
  if (!principal) return unauthorized();
  const { entryId, date } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }

  const parsed = appelPayloadSchema.safeParse({ ...(body as object), entryId, date });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return Response.json(
      { error: `Données invalides${first ? ` (${first.path.join('.')})` : ''}.` },
      { status: 400 },
    );
  }

  const res = await saveTeacherAppel(principal.tenantId, principal.userId, parsed.data);
  if (!res.ok) return Response.json({ error: res.error }, { status: 400 });
  return Response.json({ ok: true });
}
