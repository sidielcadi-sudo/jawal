'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant, prismaAdmin } from '@/lib/db';
import type { Prisma } from '@/lib/db';
import { notifyCarnetEntries } from '@/lib/carnet-notify';
import { safeSendEmail } from '@/lib/email';
import { resolveSessionTeacherUserId, createTeacherMessage } from '@/lib/notify-teacher';

type Result = { ok: true } | { ok: false; error: string };

const CARNET_LABEL: Record<string, string> = {
  ABSENCE: 'Absence',
  RETARD: 'Retard',
  EXCLUSION: 'Exclusion de cours',
};

async function authorName(
  tx: Prisma.TransactionClient,
  userId: string,
  email: string | null,
): Promise<string> {
  const link = await tx.userPerson.findFirst({
    where: { userId },
    include: { person: { select: { firstName: true, lastName: true } } },
  });
  return link?.person ? `${link.person.firstName} ${link.person.lastName}` : (email ?? 'Vie scolaire');
}

/**
 * Libère les observations/encouragements retenus (held) d'un (séance, élève) :
 * ils deviennent visibles aux parents une fois l'événement traité par la VS.
 * Retourne les ids libérés (à notifier).
 */
async function releaseHeldCarnet(
  tx: Prisma.TransactionClient,
  sessionId: string,
  studentId: string,
): Promise<string[]> {
  const held = await tx.carnetEntry.findMany({
    where: { attendanceSessionId: sessionId, studentId, heldForReview: true },
    select: { id: true },
  });
  if (held.length === 0) return [];
  await tx.carnetEntry.updateMany({
    where: { id: { in: held.map((h) => h.id) } },
    data: { visibleToParents: true, heldForReview: false },
  });
  return held.map((h) => h.id);
}

/** E-mail best-effort à l'enseignant (hors transaction). */
async function emailTeacher(
  tenantId: string,
  payload: { email: string | null; conversationId: string; subject: string; body: string } | null,
): Promise<void> {
  if (!payload?.email) return;
  const tenant = await prismaAdmin.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, localeDefault: true },
  });
  const base = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? '';
  const link = `${base}/${tenant?.localeDefault ?? 'fr'}/enseignant/messages/${payload.conversationId}`;
  await safeSendEmail({
    to: payload.email,
    subject: `[${tenant?.name ?? 'Établissement'}] ${payload.subject}`,
    html: `<p>${payload.body.replace(/\n/g, '<br/>')}</p>` + (base ? `<p><a href="${link}">Ouvrir la messagerie</a></p>` : ''),
    text: payload.body + (base ? `\n\nMessagerie : ${link}` : ''),
  });
}

/**
 * Confirme un événement d'absence : matérialise une entrée de carnet (couche
 * communication), verrouille la session, notifie les parents. Ne modifie JAMAIS
 * le record du prof.
 */
export async function confirmEventAction(id: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('attendance.write');
  const tenantId = session.user.tenantId;
  try {
    const carnetId = await withTenant(tenantId, async (tx) => {
      const ev = await tx.attendanceEvent.findUnique({ where: { id } });
      if (!ev) throw new Error('Événement introuvable.');
      const cls = await tx.class.findUnique({ where: { id: ev.classId }, select: { name: true } });
      const rec = await tx.attendanceRecord.findUnique({
        where: { id: ev.attendanceRecordId },
        select: { note: true },
      });
      const label = CARNET_LABEL[ev.category] ?? ev.category;
      const content =
        `${label} confirmée le ${ev.date.toLocaleDateString('fr-FR')}` +
        (cls?.name ? ` — ${cls.name}` : '') +
        (ev.category === 'RETARD' && ev.lateMinutes ? ` (${ev.lateMinutes} min)` : '') +
        (rec?.note ? ` — « ${rec.note} »` : '');

      let carnetEntryId = ev.carnetEntryId;
      const name = await authorName(tx, session.user.id, session.user.email ?? null);
      if (carnetEntryId) {
        await tx.carnetEntry.update({
          where: { id: carnetEntryId },
          data: { type: ev.category as never, content, visibleToParents: true },
        });
      } else {
        const entry = await tx.carnetEntry.create({
          data: {
            tenantId,
            studentId: ev.studentId,
            type: ev.category as never,
            content,
            classId: ev.classId,
            attendanceSessionId: ev.sessionId,
            occurredAt: ev.date,
            authorUserId: session.user.id,
            authorName: name,
            authorRole: 'vie-scolaire',
            visibleToParents: true,
          },
        });
        carnetEntryId = entry.id;
      }

      await tx.attendanceEvent.update({
        where: { id },
        data: { status: 'CONFIRMED', processedByUserId: session.user.id, processedAt: new Date(), carnetEntryId },
      });
      await tx.attendanceSession.update({ where: { id: ev.sessionId }, data: { vsLocked: true } });
      // Libère les observations du prof retenues pour cet élève/cette séance.
      const released = await releaseHeldCarnet(tx, ev.sessionId, ev.studentId);
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'confirm',
        entityType: 'AttendanceEvent',
        entityId: id,
      });
      return [carnetEntryId, ...released].filter((x): x is string => !!x);
    });
    if (carnetId.length) await notifyCarnetEntries(tenantId, carnetId);
    revalidatePath('/admin/attendance/management');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

export async function justifyEventAction(id: string, reason: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('attendance.write');
  if (!reason || reason.trim().length < 2) return { ok: false, error: 'Motif requis.' };
  const tenantId = session.user.tenantId;
  try {
    const released = await withTenant(tenantId, async (tx) => {
      const ev = await tx.attendanceEvent.update({
        where: { id },
        data: {
          status: 'JUSTIFIED',
          justifReason: reason.trim(),
          processedByUserId: session.user.id,
          processedAt: new Date(),
        },
        select: { sessionId: true, studentId: true },
      });
      const ids = await releaseHeldCarnet(tx, ev.sessionId, ev.studentId);
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'justify',
        entityType: 'AttendanceEvent',
        entityId: id,
      });
      return ids;
    });
    if (released.length) await notifyCarnetEntries(tenantId, released);
    revalidatePath('/admin/attendance/management');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/** Annule l'événement (erreur de saisie côté prof). Le record du prof reste tel quel. */
export async function cancelEventAction(id: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('attendance.write');
  const tenantId = session.user.tenantId;
  try {
    const released = await withTenant(tenantId, async (tx) => {
      const ev = await tx.attendanceEvent.findUnique({ where: { id } });
      if (!ev) throw new Error('Événement introuvable.');
      if (ev.carnetEntryId) {
        await tx.carnetEntry.deleteMany({ where: { id: ev.carnetEntryId } });
      }
      await tx.attendanceEvent.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          carnetEntryId: null,
          processedByUserId: session.user.id,
          processedAt: new Date(),
        },
      });
      // L'événement était une erreur → l'observation devient un cas « ordinaire »
      // et est transmise au parent.
      const ids = await releaseHeldCarnet(tx, ev.sessionId, ev.studentId);
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'cancel',
        entityType: 'AttendanceEvent',
        entityId: id,
      });

      // Notifie l'enseignant de l'annulation de son signalement.
      const sess = await tx.attendanceSession.findUnique({
        where: { id: ev.sessionId },
        select: { periodLabel: true },
      });
      const stu = await tx.person.findUnique({
        where: { id: ev.studentId },
        select: { firstName: true, lastName: true },
      });
      const teacherUserId = await resolveSessionTeacherUserId(tx, {
        classId: ev.classId,
        date: ev.date,
        periodLabel: sess?.periodLabel ?? null,
      });
      let mail: { email: string | null; conversationId: string; subject: string; body: string } | null =
        null;
      if (teacherUserId) {
        const who = stu ? `${stu.lastName} ${stu.firstName}` : "l'élève";
        const cat = ev.category === 'RETARD' ? 'retard' : ev.category === 'ABSENCE' ? 'absence' : 'événement';
        const subject = 'Signalement annulé par la vie scolaire';
        const body =
          `Bonjour,\n\nLe ${cat} de ${who} du ${ev.date.toLocaleDateString('fr-FR')} que vous aviez ` +
          `signalé a été annulé par la vie scolaire.\n\n— Vie scolaire`;
        const msg = await createTeacherMessage(tx, {
          tenantId,
          fromUserId: session.user.id,
          teacherUserId,
          subject,
          body,
        });
        mail = msg ? { ...msg, subject, body } : null;
      }
      return { ids, mail };
    });
    if (released.ids.length) await notifyCarnetEntries(tenantId, released.ids);
    await emailTeacher(tenantId, released.mail);
    revalidatePath('/admin/attendance/management');
    revalidatePath('/admin/messages');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/** Convertit l'événement absence↔retard (sur l'événement, jamais sur le record). */
export async function convertEventAction(id: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('attendance.write');
  const tenantId = session.user.tenantId;
  try {
    const mail = await withTenant(tenantId, async (tx) => {
      const ev = await tx.attendanceEvent.findUnique({ where: { id } });
      if (!ev) throw new Error('Événement introuvable.');
      const next = ev.category === 'ABSENCE' ? 'RETARD' : ev.category === 'RETARD' ? 'ABSENCE' : null;
      if (!next) throw new Error('Conversion possible seulement entre absence et retard.');
      await tx.attendanceEvent.update({
        where: { id },
        data: { category: next, processedByUserId: session.user.id, processedAt: new Date() },
      });
      if (ev.carnetEntryId) {
        await tx.carnetEntry.update({ where: { id: ev.carnetEntryId }, data: { type: next as never } });
      }
      // L'observation du prof peut être caduque après conversion → on la RETIRE
      // de la file de transmission (reste privée, non transmise aux parents).
      await tx.carnetEntry.updateMany({
        where: { attendanceSessionId: ev.sessionId, studentId: ev.studentId, heldForReview: true },
        data: { heldForReview: false },
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'convert',
        entityType: 'AttendanceEvent',
        entityId: id,
        after: { category: next },
      });

      // Notifie l'enseignant du changement.
      const sess = await tx.attendanceSession.findUnique({
        where: { id: ev.sessionId },
        select: { periodLabel: true },
      });
      const stu = await tx.person.findUnique({
        where: { id: ev.studentId },
        select: { firstName: true, lastName: true },
      });
      const teacherUserId = await resolveSessionTeacherUserId(tx, {
        classId: ev.classId,
        date: ev.date,
        periodLabel: sess?.periodLabel ?? null,
      });
      if (!teacherUserId) return null;
      const who = stu ? `${stu.lastName} ${stu.firstName}` : "l'élève";
      const subject = 'Événement converti par la vie scolaire';
      const body =
        `Bonjour,\n\nL'événement de ${who} du ${ev.date.toLocaleDateString('fr-FR')} a été ` +
        `converti en ${next === 'RETARD' ? 'retard' : 'absence'} par la vie scolaire.\n` +
        `Votre observation éventuelle n'a pas été transmise aux parents (potentiellement caduque) — ` +
        `merci de la revoir si nécessaire.\n\n— Vie scolaire`;
      const msg = await createTeacherMessage(tx, {
        tenantId,
        fromUserId: session.user.id,
        teacherUserId,
        subject,
        body,
      });
      return msg ? { ...msg, subject, body } : null;
    });
    await emailTeacher(tenantId, mail);
    revalidatePath('/admin/attendance/management');
    revalidatePath('/admin/messages');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/**
 * Traite la justification déposée par le PARENT sur un événement :
 *  - APPROVED → justification acceptée + l'événement passe en JUSTIFIED ;
 *  - REJECTED → justification refusée (motif obligatoire) ; le parent peut
 *    re-déposer (la justification rejetée réapparaît dans « À justifier »).
 */
export async function reviewParentJustificationAction(
  eventId: string,
  decision: 'APPROVED' | 'REJECTED',
  reviewNote?: string,
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('attendance.write');
  if (decision === 'REJECTED' && (!reviewNote || reviewNote.trim().length < 2)) {
    return { ok: false, error: 'Motif de refus obligatoire.' };
  }
  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const ev = await tx.attendanceEvent.findUnique({
        where: { id: eventId },
        select: { attendanceRecordId: true },
      });
      if (!ev) throw new Error('Événement introuvable.');
      const justif = await tx.absenceJustification.findUnique({
        where: { attendanceRecordId: ev.attendanceRecordId },
      });
      if (!justif) throw new Error('Aucune justification du parent.');

      await tx.absenceJustification.update({
        where: { id: justif.id },
        data: {
          status: decision,
          reviewedByUserId: session.user.id,
          reviewedAt: new Date(),
          reviewNote: reviewNote?.trim() ?? null,
        },
      });
      if (decision === 'APPROVED') {
        await tx.attendanceEvent.update({
          where: { id: eventId },
          data: {
            status: 'JUSTIFIED',
            justifReason: justif.reason,
            processedByUserId: session.user.id,
            processedAt: new Date(),
          },
        });
      }
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: decision === 'APPROVED' ? 'approveJustification' : 'rejectJustification',
        entityType: 'AttendanceEvent',
        entityId: eventId,
        after: { decision },
      });
    });
    revalidatePath('/admin/attendance/management');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
