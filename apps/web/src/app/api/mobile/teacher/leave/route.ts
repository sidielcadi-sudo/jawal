import { z } from 'zod';
import { withTenant } from '@/lib/db';
import { verifyMobileTeacher, unauthorized } from '@/lib/mobile-teacher';
import { getTeacherPersonId } from '@/lib/teacher';
import { workingDaysBetween } from '@/lib/leave';
import { alertTeacherAbsence } from '@/lib/leave-alerts';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/mobile/teacher/leave
 * → demandes de congé/absence du professeur + types disponibles.
 */
export async function GET(req: Request) {
  const principal = await verifyMobileTeacher(req);
  if (!principal) return unauthorized();

  const data = await withTenant(principal.tenantId, async (tx) => {
    const personId = await getTeacherPersonId(tx, principal.userId);
    if (!personId) return null;

    const [requests, types] = await Promise.all([
      tx.leaveRequest.findMany({
        where: { personId },
        orderBy: { startDate: 'desc' },
        take: 50,
        select: {
          id: true,
          startDate: true,
          endDate: true,
          days: true,
          status: true,
          reason: true,
          decisionComment: true,
          leaveType: { select: { labelFr: true } },
        },
      }),
      tx.leaveType.findMany({ orderBy: { labelFr: 'asc' }, select: { id: true, labelFr: true } }),
    ]);

    return {
      types: types.map((t) => ({ id: t.id, label: t.labelFr })),
      requests: requests.map((r) => ({
        id: r.id,
        typeLabel: r.leaveType.labelFr,
        startDate: r.startDate.toISOString().slice(0, 10),
        endDate: r.endDate.toISOString().slice(0, 10),
        days: r.days,
        status: r.status,
        reason: r.reason,
        decisionComment: r.decisionComment,
      })),
    };
  });

  if (!data) return Response.json({ error: 'Profil enseignant introuvable.' }, { status: 404 });
  return Response.json(data);
}

const createSchema = z.object({
  leaveTypeId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().max(2000).optional(),
});

/**
 * POST /api/mobile/teacher/leave
 * → auto-déclaration d'absence depuis le téléphone. Créée en PENDING et
 *   alerte la vie scolaire et la direction, comme depuis le portail : c'est
 *   l'étape 1 du workflow de remplacement.
 */
export async function POST(req: Request) {
  const principal = await verifyMobileTeacher(req);
  if (!principal) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Données invalides.' }, { status: 400 });
  }

  const startDate = new Date(`${parsed.data.startDate}T00:00:00.000Z`);
  const endDate = new Date(`${parsed.data.endDate}T00:00:00.000Z`);
  if (endDate < startDate) {
    return Response.json({ error: 'La date de fin précède la date de début.' }, { status: 400 });
  }
  const days = workingDaysBetween(startDate, endDate);

  try {
    const id = await withTenant(principal.tenantId, async (tx) => {
      const personId = await getTeacherPersonId(tx, principal.userId);
      if (!personId) throw new Error('Profil enseignant introuvable.');

      const overlap = await tx.leaveRequest.count({
        where: {
          personId,
          status: { in: ['PENDING', 'APPROVED'] },
          startDate: { lte: endDate },
          endDate: { gte: startDate },
        },
      });
      if (overlap > 0) throw new Error('Une demande chevauche déjà cette période.');

      const r = await tx.leaveRequest.create({
        data: {
          tenantId: principal.tenantId,
          personId,
          leaveTypeId: parsed.data.leaveTypeId,
          startDate,
          endDate,
          days,
          reason: parsed.data.reason ?? null,
          status: 'PENDING',
        },
        include: {
          person: { select: { firstName: true, lastName: true } },
          leaveType: { select: { labelFr: true } },
        },
      });
      await alertTeacherAbsence(tx, principal.tenantId, {
        leaveId: r.id,
        teacherName: `${r.person.lastName} ${r.person.firstName}`,
        typeLabel: r.leaveType.labelFr,
        start: startDate,
        end: endDate,
      });
      await logAudit(tx, {
        tenantId: principal.tenantId,
        userId: principal.userId,
        action: 'create',
        entityType: 'LeaveRequest',
        entityId: r.id,
        after: { personId, days, selfDeclared: true, source: 'mobile' },
      });
      return r.id;
    });
    return Response.json({ ok: true, id });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 400 });
  }
}
