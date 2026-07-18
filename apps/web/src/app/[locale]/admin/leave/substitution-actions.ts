'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { requireRoleCode } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import type { Prisma } from '@/lib/db';
import { withTenant } from '@/lib/db';
import { sendNotifications, parentRecipient, emailRecipient, type NotifyItem } from '@/lib/notify';
import { sendDirectMessage } from '@/lib/inapp-message';
import { alertRole } from '@/lib/staff-alerts';

type Result = { ok: true } | { ok: false; error: string };

/** Vie scolaire + direction : peuvent affecter et valider un remplacement. */
const SUBSTITUTION_ROLES = ['tenant_admin', 'direction', 'cpe', 'scolarite'];
/** Direction/admin uniquement : approuvent ou refusent un remplacement validé. */
const APPROVAL_ROLES = ['tenant_admin', 'direction'];

/**
 * Crée ou met à jour l'heure sup auto d'un remplacement (source SUBSTITUTION,
 * `sourceRef` = id de l'override → idempotent). Une entrée déjà avancée dans le
 * circuit (≠ DECLARED) n'est jamais modifiée, pour préserver la paie.
 */
async function upsertAutoOvertime(
  tx: Prisma.TransactionClient,
  args: {
    tenantId: string;
    overrideId: string;
    personId: string;
    date: Date;
    hours: number;
    note: string;
    createdByUserId: string;
  },
): Promise<void> {
  if (args.hours <= 0) return;
  const existing = await tx.overtimeEntry.findFirst({
    where: { source: 'SUBSTITUTION', sourceRef: args.overrideId },
    select: { id: true, status: true },
  });
  if (existing) {
    if (existing.status !== 'DECLARED') return; // déjà validée/traitée : on n'y touche pas
    await tx.overtimeEntry.update({
      where: { id: existing.id },
      data: { personId: args.personId, date: args.date, hours: args.hours, note: args.note },
    });
    return;
  }
  await tx.overtimeEntry.create({
    data: {
      tenantId: args.tenantId,
      personId: args.personId,
      date: args.date,
      hours: args.hours,
      source: 'SUBSTITUTION',
      sourceRef: args.overrideId,
      note: args.note,
      status: 'DECLARED',
      createdByUserId: args.createdByUserId,
    },
  });
}

/** Retire l'heure sup auto (DECLARED) d'un override annulé/supprimé. */
async function removeAutoOvertime(
  tx: Prisma.TransactionClient,
  overrideId: string,
): Promise<void> {
  await tx.overtimeEntry.deleteMany({
    where: { source: 'SUBSTITUTION', sourceRef: overrideId, status: 'DECLARED' },
  });
}

const fmtDate = (dateStr: string) => dateStr.split('-').reverse().join('/');
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
/** Durée du créneau en heures (2 décimales), pour l'heure sup du remplaçant. */
const slotHours = (start: string, end: string) =>
  Math.round(((toMin(end) - toMin(start)) / 60) * 100) / 100;

/**
 * Affecte (ou retire) un remplaçant sur une séance datée, via TimetableOverride.
 * `value` : '' = retirer l'override, 'CANCELLED' = cours annulé, sinon = id du
 * prof remplaçant (kind SUBSTITUTION).
 */
export async function assignSubstituteAction(
  entryId: string,
  dateStr: string,
  value: string,
  leaveId: string,
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  // Le remplacement est du ressort de la vie scolaire et de la direction
  // (cf. workflow), pas seulement de l'admin. tenant_admin passe toujours.
  await requireRoleCode(['tenant_admin', 'direction', 'cpe', 'scolarite']);
  const tenantId = session.user.tenantId;
  const date = new Date(`${dateStr}T00:00:00.000Z`);

  try {
    await withTenant(tenantId, async (tx) => {
      const entry = await tx.timetableEntry.findUnique({
        where: { id: entryId },
        select: {
          id: true,
          subjectId: true,
          slot: { select: { startTime: true, endTime: true } },
          subject: { select: { label: true } },
          room: { select: { code: true } },
          class: { select: { id: true, name: true } },
        },
      });
      if (!entry) throw new Error('Séance introuvable.');

      // Override existant (pour nettoyer l'heure sup auto rattachée le cas échéant).
      const prev = await tx.timetableOverride.findUnique({
        where: { entryId_date: { entryId, date } },
        select: { id: true },
      });

      if (value === '') {
        if (prev) await removeAutoOvertime(tx, prev.id);
        await tx.timetableOverride.deleteMany({ where: { entryId, date } });
      } else {
        const isCancel = value === 'CANCELLED';
        const override = await tx.timetableOverride.upsert({
          where: { entryId_date: { entryId, date } },
          create: {
            tenantId,
            entryId,
            date,
            kind: isCancel ? 'CANCELLED' : 'SUBSTITUTION',
            substituteTeacherId: isCancel ? null : value,
            reason: 'Congé / absence',
            createdByUserId: session.user.id,
          },
          update: {
            kind: isCancel ? 'CANCELLED' : 'SUBSTITUTION',
            substituteTeacherId: isCancel ? null : value,
            reason: 'Congé / absence',
            // Toute (ré)affectation repart de zéro : non validée et en attente
            // d'approbation. La vie scolaire re-valide, puis la direction approuve.
            validatedAt: null,
            validatedByUserId: null,
            approvalStatus: 'PENDING',
            approvalByUserId: null,
            approvalAt: null,
            approvalComment: null,
          },
        });

        // ── Étape 5 « Traçabilité » : heure sup auto du remplaçant ────────────
        // Remplacement → une heure sup DECLARED (durée du créneau) ; annulation
        // → on retire l'heure sup éventuelle. Les entrées déjà validées/traitées
        // ne sont jamais modifiées (intégrité paie).
        if (isCancel) {
          await removeAutoOvertime(tx, override.id);
        } else {
          await upsertAutoOvertime(tx, {
            tenantId,
            overrideId: override.id,
            personId: value,
            date,
            hours: slotHours(entry.slot.startTime, entry.slot.endTime),
            note: `Remplacement · ${entry.class.name} · ${entry.subject?.label ?? '—'}`,
            createdByUserId: session.user.id,
          });
        }
        // Les messages (remplaçant + parents) ne partent PAS ici : ils sont
        // envoyés à la validation (validateSubstitutionAction).
      }
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'substitute',
        entityType: 'TimetableEntry',
        entityId: entryId,
        after: { date: dateStr, value },
      });
    });
    revalidatePath(`/admin/leave/${leaveId}/remplacements`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/**
 * Envoie les messages d'un remplacement ou d'une annulation APPROUVÉ(E) :
 * - au remplaçant (si remplacement) : message interne + SMS ;
 * - à chaque parent ET à l'élève : message interne + e-mail (+ SMS parent).
 * Appelée uniquement à l'approbation.
 */
async function notifySubstitution(
  tx: Prisma.TransactionClient,
  args: {
    tenantId: string;
    fromUserId: string;
    overrideId: string;
    kind: 'SUBSTITUTION' | 'CANCELLED';
    substituteTeacherId: string | null;
    classId: string;
    className: string;
    subjectName: string;
    slotLabel: string;
    roomCode: string | null;
    dateStr: string;
  },
): Promise<void> {
  const { tenantId, fromUserId, overrideId, kind, className, subjectName, slotLabel } = args;
  const dateLabel = fmtDate(args.dateStr);
  const cancelled = kind === 'CANCELLED';
  const locale =
    (await tx.tenant.findFirst({ select: { localeDefault: true } }))?.localeDefault ?? 'fr';
  const items: NotifyItem[] = [];

  // ── Remplaçant (remplacement uniquement) : message interne + SMS ─────────
  if (!cancelled && args.substituteTeacherId) {
    const subBody = `Vous assurez un remplacement le ${dateLabel} (${slotLabel}) — ${subjectName} avec la classe ${className}${args.roomCode ? `, salle ${args.roomCode}` : ''}.`;
    const [subUser, subPerson] = await Promise.all([
      tx.userPerson.findFirst({ where: { personId: args.substituteTeacherId }, select: { userId: true } }),
      tx.person.findUnique({ where: { id: args.substituteTeacherId }, select: { contacts: true } }),
    ]);
    if (subUser?.userId) {
      await sendDirectMessage(tx, {
        tenantId,
        fromUserId,
        toUserId: subUser.userId,
        subject: `Remplacement du ${dateLabel}`,
        body: subBody,
      });
    }
    items.push({
      channel: 'SMS',
      recipient: parentRecipient(subPerson?.contacts),
      template: 'substitution.assigned',
      data: { date: dateLabel, slot: slotLabel, subject: subjectName, class: className, room: args.roomCode ?? '' },
      relatedType: 'TimetableOverride',
      relatedId: overrideId,
    });
  }

  // ── Élèves de la classe : e-mail + message interne à l'élève ET aux parents
  const template = cancelled ? 'substitution.cancelled' : 'substitution.class';
  const enrollments = await tx.enrollment.findMany({
    where: { classId: args.classId, status: 'ACTIVE' },
    select: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          contacts: true,
          userPersons: { select: { userId: true, user: { select: { email: true } } } },
        },
      },
    },
  });
  const studentIds = enrollments.map((e) => e.student.id);
  const relations = studentIds.length
    ? await tx.personRelation.findMany({
        where: { childId: { in: studentIds } },
        select: {
          childId: true,
          parent: {
            select: { contacts: true, userPersons: { select: { userId: true, user: { select: { email: true } } } } },
          },
        },
        orderBy: { createdAt: 'asc' },
      })
    : [];
  const parentOf = new Map<string, { contacts: unknown; userId: string | null; email: string | null }>();
  for (const r of relations) {
    if (!parentOf.has(r.childId)) {
      parentOf.set(r.childId, {
        contacts: r.parent.contacts,
        userId: r.parent.userPersons[0]?.userId ?? null,
        email: r.parent.userPersons[0]?.user?.email ?? null,
      });
    }
  }

  for (const e of enrollments) {
    const childName = `${e.student.firstName} ${e.student.lastName}`;
    const body = cancelled
      ? `Le cours de ${subjectName} du ${dateLabel} (${slotLabel}) de ${childName} est annulé.`
      : `Le cours de ${subjectName} du ${dateLabel} (${slotLabel}) de ${childName} sera assuré par un(e) remplaçant(e).`;
    const subject = cancelled
      ? `Cours annulé du ${dateLabel} — ${className}`
      : `Remplacement du ${dateLabel} — ${className}`;
    const data = { date: dateLabel, slot: slotLabel, subject: subjectName, child: childName };

    // Parent référent : message interne + e-mail + SMS.
    const parent = parentOf.get(e.student.id);
    if (parent?.userId) {
      await sendDirectMessage(tx, { tenantId, fromUserId, toUserId: parent.userId, subject, body });
    }
    items.push({ channel: 'EMAIL', recipient: emailRecipient(parent?.contacts, parent?.email), template, data, studentId: e.student.id, relatedType: 'TimetableOverride', relatedId: overrideId });
    items.push({ recipient: parentRecipient(parent?.contacts), template, data, studentId: e.student.id, relatedType: 'TimetableOverride', relatedId: overrideId });

    // Élève : message interne (son compte) + e-mail.
    const studentUser = e.student.userPersons[0];
    if (studentUser?.userId) {
      await sendDirectMessage(tx, { tenantId, fromUserId, toUserId: studentUser.userId, subject, body });
    }
    items.push({ channel: 'EMAIL', recipient: emailRecipient(e.student.contacts, studentUser?.user?.email), template, data, studentId: e.student.id, relatedType: 'TimetableOverride', relatedId: overrideId });
  }

  await sendNotifications(tx, tenantId, locale, items);
}

/** Détails d'un override à valider/approuver (séance + remplaçant). */
const OVERRIDE_DETAIL = {
  id: true,
  kind: true,
  substituteTeacherId: true,
  validatedAt: true,
  approvalStatus: true,
  entry: {
    select: {
      slot: { select: { startTime: true, endTime: true } },
      subject: { select: { label: true } },
      room: { select: { code: true } },
      class: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.TimetableOverrideSelect;

/**
 * Validation par la vie scolaire : SOUMET le remplacement à l'approbation de la
 * direction. Aucun message n'est envoyé ici (ils partent à l'approbation).
 */
export async function validateSubstitutionAction(
  entryId: string,
  dateStr: string,
  leaveId: string,
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requireRoleCode(SUBSTITUTION_ROLES);
  const tenantId = session.user.tenantId;
  const fromUserId = session.user.id;
  const date = new Date(`${dateStr}T00:00:00.000Z`);

  try {
    await withTenant(tenantId, async (tx) => {
      const override = await tx.timetableOverride.findUnique({
        where: { entryId_date: { entryId, date } },
        select: { id: true, kind: true, substituteTeacherId: true, validatedAt: true },
      });
      if (!override) throw new Error('Aucune décision à valider sur cette séance.');
      // Un remplacement (avec remplaçant) OU une annulation de cours est validable.
      if (override.kind === 'SUBSTITUTION' && !override.substituteTeacherId) {
        throw new Error('Choisissez d’abord un remplaçant.');
      }
      if (override.validatedAt) return; // déjà validé

      // Soumission : validé + remis en attente d'approbation.
      await tx.timetableOverride.update({
        where: { id: override.id },
        data: {
          validatedAt: new Date(),
          validatedByUserId: fromUserId,
          approvalStatus: 'PENDING',
          approvalByUserId: null,
          approvalAt: null,
          approvalComment: null,
        },
      });
      await logAudit(tx, {
        tenantId,
        userId: fromUserId,
        action: 'validate_substitute',
        entityType: 'TimetableOverride',
        entityId: override.id,
        after: { date: dateStr },
      });
    });
    revalidatePath(`/admin/leave/${leaveId}/remplacements`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/**
 * Approbation par la direction/admin d'un remplacement validé : marque APPROVED
 * et envoie les messages (remplaçant + parents). Idempotent.
 */
export async function approveSubstitutionAction(
  entryId: string,
  dateStr: string,
  leaveId: string,
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requireRoleCode(APPROVAL_ROLES);
  const tenantId = session.user.tenantId;
  const fromUserId = session.user.id;
  const date = new Date(`${dateStr}T00:00:00.000Z`);

  try {
    await withTenant(tenantId, async (tx) => {
      const override = await tx.timetableOverride.findUnique({
        where: { entryId_date: { entryId, date } },
        select: OVERRIDE_DETAIL,
      });
      if (!override) throw new Error('Décision introuvable.');
      if (!override.validatedAt) throw new Error('La séance doit d’abord être validée par la vie scolaire.');
      if (override.kind === 'SUBSTITUTION' && !override.substituteTeacherId) {
        throw new Error('Aucun remplaçant affecté.');
      }
      if (override.approvalStatus === 'APPROVED') return; // déjà approuvé → pas de renvoi

      await tx.timetableOverride.update({
        where: { id: override.id },
        data: { approvalStatus: 'APPROVED', approvalByUserId: fromUserId, approvalAt: new Date(), approvalComment: null },
      });

      await notifySubstitution(tx, {
        tenantId,
        fromUserId,
        overrideId: override.id,
        kind: override.kind,
        substituteTeacherId: override.substituteTeacherId,
        classId: override.entry.class.id,
        className: override.entry.class.name,
        subjectName: override.entry.subject?.label ?? '—',
        slotLabel: `${override.entry.slot.startTime}–${override.entry.slot.endTime}`,
        roomCode: override.entry.room?.code ?? null,
        dateStr,
      });
      await logAudit(tx, {
        tenantId,
        userId: fromUserId,
        action: 'approve_substitute',
        entityType: 'TimetableOverride',
        entityId: override.id,
        after: { date: dateStr },
      });
    });
    revalidatePath(`/admin/leave/${leaveId}/remplacements`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/**
 * Refus par la direction/admin d'un remplacement validé : marque REFUSED,
 * retire l'heure sup auto et alerte la vie scolaire pour réaffectation. Aucun
 * message aux parents.
 */
export async function refuseSubstitutionAction(
  entryId: string,
  dateStr: string,
  leaveId: string,
  comment?: string,
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requireRoleCode(APPROVAL_ROLES);
  const tenantId = session.user.tenantId;
  const fromUserId = session.user.id;
  const date = new Date(`${dateStr}T00:00:00.000Z`);

  try {
    await withTenant(tenantId, async (tx) => {
      const override = await tx.timetableOverride.findUnique({
        where: { entryId_date: { entryId, date } },
        select: OVERRIDE_DETAIL,
      });
      if (!override) throw new Error('Remplacement introuvable.');
      if (!override.validatedAt) throw new Error('Le remplacement doit d’abord être validé par la vie scolaire.');

      await tx.timetableOverride.update({
        where: { id: override.id },
        data: {
          approvalStatus: 'REFUSED',
          approvalByUserId: fromUserId,
          approvalAt: new Date(),
          approvalComment: comment?.trim() || null,
        },
      });
      // Le remplaçant refusé ne compte pas : on retire l'heure sup auto.
      await removeAutoOvertime(tx, override.id);

      // Alerte la vie scolaire pour réaffecter un autre remplaçant.
      await alertRole(tx, tenantId, ['cpe', 'scolarite'], {
        type: 'SUBSTITUTION_REFUSED',
        title: `Remplacement refusé — ${override.entry.class.name}`,
        body: `${override.entry.subject?.label ?? 'Cours'} du ${fmtDate(dateStr)} (${override.entry.slot.startTime}–${override.entry.slot.endTime})${comment?.trim() ? ` · ${comment.trim()}` : ''}. À réaffecter.`,
        link: `/admin/leave/${leaveId}/remplacements`,
        relatedType: 'TimetableOverride',
        relatedId: override.id,
      });
      await logAudit(tx, {
        tenantId,
        userId: fromUserId,
        action: 'refuse_substitute',
        entityType: 'TimetableOverride',
        entityId: override.id,
        after: { date: dateStr, comment: comment ?? null },
      });
    });
    revalidatePath(`/admin/leave/${leaveId}/remplacements`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
