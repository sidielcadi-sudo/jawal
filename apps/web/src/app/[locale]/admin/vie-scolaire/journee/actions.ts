'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant, prismaAdmin } from '@/lib/db';
import { safeSendEmail } from '@/lib/email';
import { dowOf, parseDateUTC } from '@/lib/lesson-book';

type Result = { ok: true } | { ok: false; error: string };

const setMotifSchema = z.object({
  recordId: z.string().uuid(),
  reasonId: z.string().uuid(),
});

/**
 * Affecte un motif (AttendanceReason) à un record d'appel — appelé par la Vie
 * scolaire depuis la popup « Sélectionner un motif d'absence ».
 */
export async function setMotifAction(input: { recordId: string; reasonId: string }): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('attendance.write');
  const parsed = setMotifSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Données invalides.' };
  const tenantId = session.user.tenantId;

  try {
    await withTenant(tenantId, async (tx) => {
      const reason = await tx.attendanceReason.findUnique({
        where: { id: parsed.data.reasonId },
        select: { id: true },
      });
      if (!reason) throw new Error('Motif introuvable.');
      const before = await tx.attendanceRecord.findUnique({
        where: { id: parsed.data.recordId },
        select: { lateReasonId: true },
      });
      if (!before) throw new Error('Record introuvable.');
      await tx.attendanceRecord.update({
        where: { id: parsed.data.recordId },
        data: { lateReasonId: parsed.data.reasonId },
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'update',
        entityType: 'AttendanceRecord',
        entityId: parsed.data.recordId,
        before: { lateReasonId: before.lateReasonId },
        after: { lateReasonId: parsed.data.reasonId },
      });
    });
    revalidatePath('/admin/vie-scolaire/journee');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

const notifyAppelSchema = z.object({
  teacherUserId: z.string().uuid(),
  classId: z.string().uuid(),
  periodLabel: z.string().min(1).max(40),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const slotHuman = (periodLabel: string) =>
  periodLabel
    .split('-')
    .map((s) => s.replace(':', 'h'))
    .join(' - ');

/**
 * Notifie un enseignant qu'il doit faire son appel : crée une conversation
 * interne (message in-app) et envoie un e-mail best-effort. Appelé par la Vie
 * scolaire depuis le panneau « Appels non faits ».
 */
export async function notifyAppelAction(input: {
  teacherUserId: string;
  classId: string;
  periodLabel: string;
  date: string;
}): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('discipline.write');
  const parsed = notifyAppelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Données invalides.' };
  const tenantId = session.user.tenantId;
  const { teacherUserId, classId, periodLabel, date } = parsed.data;

  try {
    const dateHuman = new Date(`${date}T00:00:00`).toLocaleDateString('fr-FR', { dateStyle: 'long' });
    const slot = slotHuman(periodLabel);

    const out = await withTenant(tenantId, async (tx) => {
      const teacher = await tx.user.findFirst({
        where: { id: teacherUserId, disabledAt: null },
        select: { id: true, email: true },
      });
      if (!teacher) throw new Error('Compte enseignant introuvable.');
      const cls = await tx.class.findUnique({ where: { id: classId }, select: { name: true } });
      const className = cls?.name ?? '';
      const subject = `Appel à faire — ${className}`;
      const body =
        `Bonjour,\n\nMerci d'effectuer l'appel pour la classe ${className} ` +
        `du ${dateHuman}, créneau ${slot}.\n\n— Vie scolaire`;

      const conv = await tx.conversation.create({
        data: { tenantId, subject, createdBy: session.user.id },
      });
      await tx.conversationParticipant.createMany({
        data: [...new Set([session.user.id, teacherUserId])].map((uid) => ({
          tenantId,
          conversationId: conv.id,
          userId: uid,
        })),
      });
      await tx.message.create({
        data: { tenantId, conversationId: conv.id, senderUserId: session.user.id, body },
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'notify',
        entityType: 'Conversation',
        entityId: conv.id,
        after: { reason: 'appel-non-fait', classId, periodLabel, date },
      });

      // Trace la relance (table AppelReminder) pour qu'elle soit comptabilisée
      // dans le KPI « Relances reçues » du prof — même clé que le cron, donc
      // idempotent par (séance, jour). Best-effort : si la case d'EDT est
      // introuvable, la notification part quand même.
      const [startTime, endTime] = periodLabel.split('-');
      const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });
      if (year && startTime && endTime) {
        const entry = await tx.timetableEntry.findFirst({
          where: { academicYearId: year.id, classId, dayOfWeek: dowOf(date), slot: { startTime, endTime } },
          select: { id: true },
        });
        if (entry) {
          await tx.appelReminder.upsert({
            where: { entryId_date: { entryId: entry.id, date: parseDateUTC(date) } },
            create: { tenantId, entryId: entry.id, date: parseDateUTC(date) },
            update: {},
          });
        }
      }

      return { email: teacher.email, subject, body, conversationId: conv.id };
    });

    // E-mail best-effort (hors transaction).
    if (out.email) {
      const tenant = await prismaAdmin.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, localeDefault: true },
      });
      const base = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? '';
      const link = `${base}/${tenant?.localeDefault ?? 'fr'}/enseignant/messages/${out.conversationId}`;
      await safeSendEmail({
        to: out.email,
        subject: `[${tenant?.name ?? 'Établissement'}] ${out.subject}`,
        html:
          `<p>${out.body.replace(/\n/g, '<br/>')}</p>` +
          (base ? `<p><a href="${link}">Ouvrir la messagerie</a></p>` : ''),
        text: out.body + (base ? `\n\nMessagerie : ${link}` : ''),
      });
    }

    revalidatePath('/admin/vie-scolaire/journee');
    revalidatePath('/admin/messages');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

const toggleRaSchema = z.object({
  recordId: z.string().uuid(),
  ra: z.boolean(),
});

/**
 * Coche/décoche « RA » (absence régularisée) : matérialise/retire une
 * AbsenceJustification approuvée sur le record. Le motif (lateReason) sert de
 * libellé de justification.
 */
export async function toggleRaAction(input: { recordId: string; ra: boolean }): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('attendance.write');
  const parsed = toggleRaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Données invalides.' };
  const tenantId = session.user.tenantId;

  try {
    await withTenant(tenantId, async (tx) => {
      const record = await tx.attendanceRecord.findUnique({
        where: { id: parsed.data.recordId },
        select: { id: true, status: true, lateReason: { select: { label: true } } },
      });
      if (!record) throw new Error('Record introuvable.');
      if (record.status === 'PRESENT') throw new Error('Une présence ne se régularise pas.');

      const existing = await tx.absenceJustification.findUnique({
        where: { attendanceRecordId: parsed.data.recordId },
        select: { id: true, status: true },
      });

      if (parsed.data.ra) {
        const reason = record.lateReason?.label ?? 'Régularisée par la vie scolaire';
        if (existing) {
          await tx.absenceJustification.update({
            where: { id: existing.id },
            data: {
              reason,
              status: 'APPROVED',
              reviewedByUserId: session.user.id,
              reviewedAt: new Date(),
            },
          });
        } else {
          await tx.absenceJustification.create({
            data: {
              tenantId,
              attendanceRecordId: parsed.data.recordId,
              reason,
              status: 'APPROVED',
              submittedByUserId: session.user.id,
              reviewedByUserId: session.user.id,
              reviewedAt: new Date(),
            },
          });
        }
        await logAudit(tx, {
          tenantId,
          userId: session.user.id,
          action: 'approve',
          entityType: 'AbsenceJustification',
          entityId: parsed.data.recordId,
          after: { status: 'APPROVED', reason },
        });
      } else if (existing) {
        await tx.absenceJustification.delete({ where: { id: existing.id } });
        await logAudit(tx, {
          tenantId,
          userId: session.user.id,
          action: 'delete',
          entityType: 'AbsenceJustification',
          entityId: parsed.data.recordId,
          before: { status: existing.status },
        });
      }
    });
    revalidatePath('/admin/vie-scolaire/journee');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
