'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { Prisma } from '@jawal/db';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { withTenant } from '@/lib/db';
import { sendNotifications, parentRecipient, type NotifyItem } from '@/lib/notify';

type Result = { ok: true } | { ok: false; error: string };

/** Statut d'appel → clé de template parent (null = pas de message). */
function templateFor(direction: 'MORNING' | 'EVENING', status: string): string | null {
  if (status === 'INCIDENT') return 'transport.incident';
  if (direction === 'MORNING') {
    if (status === 'PRESENT' || status === 'LATE') return 'transport.boarded';
    if (status === 'ABSENT' || status === 'NOT_PICKED_UP') return 'transport.notBoarded';
    return null;
  }
  if (status === 'DROPPED') return 'transport.dropped';
  if (status === 'NOT_PICKED_UP') return 'transport.notPicked';
  return null; // BOARDED (soir) → pas de notification
}

/** Charge locale + élèves (nom/arrêt) + parents (destinataire) d'une ligne. */
async function buildLineNotifyContext(tx: Prisma.TransactionClient, lineId: string) {
  const tenant = await tx.tenant.findFirst({ select: { localeDefault: true } });
  const assigns = await tx.studentTransport.findMany({
    where: { lineId, status: 'ACTIVE' },
    include: { student: { select: { firstName: true, lastName: true } }, stop: { select: { name: true } } },
  });
  const studentIds = assigns.map((a) => a.studentId);
  const rels = studentIds.length
    ? await tx.personRelation.findMany({
        where: { childId: { in: studentIds } },
        include: { parent: { select: { firstName: true, lastName: true, contacts: true } } },
      })
    : [];
  const parents = new Map<string, { recipient: string | null; name: string }[]>();
  for (const r of rels) {
    const arr = parents.get(r.childId) ?? [];
    arr.push({ recipient: parentRecipient(r.parent.contacts), name: `${r.parent.lastName} ${r.parent.firstName}` });
    parents.set(r.childId, arr);
  }
  const info = new Map(
    assigns.map((a) => [a.studentId, { name: `${a.student.lastName} ${a.student.firstName}`, stop: a.stop?.name ?? '' }]),
  );
  return { locale: tenant?.localeDefault ?? 'fr', parents, info, studentIds };
}

const STATUSES = [
  'PRESENT',
  'ABSENT',
  'LATE',
  'NOT_PICKED_UP',
  'BOARDED',
  'DROPPED',
  'INCIDENT',
] as const;

const schema = z.object({
  lineId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  direction: z.enum(['MORNING', 'EVENING']),
  records: z
    .array(z.object({ studentId: z.string().uuid(), status: z.enum(STATUSES), note: z.string().max(500).optional() }))
    .min(1),
});

/** Enregistre l'appel transport d'une ligne (matin/soir) : crée/maj la session + les pointages horodatés. */
export async function saveTransportAppelAction(input: {
  lineId: string;
  date: string;
  direction: 'MORNING' | 'EVENING';
  records: { studentId: string; status: (typeof STATUSES)[number]; note?: string }[];
}): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('students.write');
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Données invalides.' };
  const { lineId, direction } = parsed.data;
  const date = new Date(`${parsed.data.date}T00:00:00.000Z`);
  const tenantId = session.user.tenantId;

  try {
    await withTenant(tenantId, async (tx) => {
      const appelSession = await tx.transportAttendanceSession.upsert({
        where: { lineId_date_direction: { lineId, date, direction } },
        create: { tenantId, lineId, date, direction },
        update: {},
      });
      for (const r of parsed.data.records) {
        await tx.transportAttendanceRecord.upsert({
          where: { sessionId_studentId: { sessionId: appelSession.id, studentId: r.studentId } },
          create: {
            tenantId,
            sessionId: appelSession.id,
            studentId: r.studentId,
            status: r.status,
            recordedByUserId: session.user.id,
            note: r.note ?? null,
          },
          update: { status: r.status, recordedAt: new Date(), recordedByUserId: session.user.id, note: r.note ?? null },
        });
      }

      // Notifications parents (selon le statut + le trajet).
      const ctx = await buildLineNotifyContext(tx, lineId);
      const items: NotifyItem[] = [];
      for (const r of parsed.data.records) {
        const tpl = templateFor(direction, r.status);
        const inf = ctx.info.get(r.studentId);
        if (!tpl || !inf) continue;
        for (const p of ctx.parents.get(r.studentId) ?? []) {
          items.push({
            recipient: p.recipient,
            recipientName: p.name,
            template: tpl,
            data: { child: inf.name, stop: inf.stop },
            studentId: r.studentId,
            relatedType: 'TransportAppel',
            relatedId: appelSession.id,
          });
        }
      }
      if (items.length) await sendNotifications(tx, tenantId, ctx.locale, items);
    });
    revalidatePath('/admin/transport/appel');
    revalidatePath('/admin/transport');
    revalidatePath('/admin/transport/notifications');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/** Notifie tous les parents d'une ligne d'un événement ponctuel : bus en approche / retard. */
export async function notifyLineEventAction(
  lineId: string,
  event: 'approaching' | 'delay',
  minutes: number,
): Promise<{ ok: true; sent: number } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('students.write');
  const mins = Math.min(120, Math.max(1, Math.round(minutes) || 5));
  const tenantId = session.user.tenantId;
  try {
    return await withTenant(tenantId, async (tx): Promise<{ ok: true; sent: number } | { ok: false; error: string }> => {
      const line = await tx.transportLine.findUnique({ where: { id: lineId }, select: { name: true } });
      if (!line) return { ok: false, error: 'Ligne introuvable.' };
      const ctx = await buildLineNotifyContext(tx, lineId);
      const template = event === 'delay' ? 'transport.delay' : 'transport.approaching';
      const items: NotifyItem[] = [];
      for (const sid of ctx.studentIds) {
        for (const p of ctx.parents.get(sid) ?? []) {
          items.push({
            recipient: p.recipient,
            recipientName: p.name,
            template,
            data: { line: line.name, minutes: mins },
            studentId: sid,
            relatedType: 'TransportLineEvent',
            relatedId: lineId,
          });
        }
      }
      const res = await sendNotifications(tx, tenantId, ctx.locale, items);
      revalidatePath('/admin/transport/notifications');
      return { ok: true, sent: res.sent + res.queued };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
