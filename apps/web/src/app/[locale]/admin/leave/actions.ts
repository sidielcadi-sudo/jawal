'use server';

import { leaveDays, slotInPart, type DayPart } from '@/lib/leave-duration';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { requirePermission, requireRoleCode } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import type { Prisma } from '@/lib/db';
import { workingDaysBetween } from '@/lib/leave';
import { sendNotifications, parentRecipient, emailRecipient, type NotifyItem } from '@/lib/notify';
import { renderTemplate } from '@/lib/notify-templates';
import { sendDirectMessage } from '@/lib/inapp-message';
import { alertTeacherAbsence } from '@/lib/leave-alerts';

type Result = { ok: true; id?: string } | { ok: false; error: string };

const DOW_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
const fmtDate = (d: Date) => d.toISOString().slice(0, 10).split('-').reverse().join('/');

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
};

async function guard() {
  const session = await auth();
  if (!session?.user) return null;
  await requirePermission('tenants.manage');
  return session;
}

/** Rôles autorisés à enregistrer une absence (vie scolaire incluse). */
const ABSENCE_ROLES = ['tenant_admin', 'direction', 'cpe', 'scolarite'];

async function guardRoles(codes: string[]) {
  const session = await auth();
  if (!session?.user) return null;
  await requireRoleCode(codes);
  return session;
}

/** Les 8 types de congé/absence par défaut (règles marocaines). */
const DEFAULT_LEAVE_TYPES = [
  { code: 'ANNUAL', labelFr: 'Congé annuel', labelAr: 'عطلة سنوية', paid: true, accrues: true, accrualPerMonth: 1.5, requiresJustification: false, order: 1 },
  { code: 'SICK', labelFr: 'Congé maladie', labelAr: 'عطلة مرضية', paid: true, accrues: false, requiresJustification: true, order: 2 },
  { code: 'JUSTIFIED', labelFr: 'Absence justifiée', labelAr: 'غياب مبرر', paid: true, accrues: false, requiresJustification: true, order: 3 },
  { code: 'UNJUSTIFIED', labelFr: 'Absence non justifiée', labelAr: 'غياب غير مبرر', paid: false, accrues: false, requiresJustification: false, order: 4 },
  { code: 'LATE', labelFr: 'Retard', labelAr: 'تأخر', paid: true, accrues: false, requiresJustification: false, order: 5 },
  { code: 'EXCEPTIONAL', labelFr: 'Autorisation exceptionnelle', labelAr: 'إذن استثنائي', paid: true, accrues: false, requiresJustification: false, order: 6 },
  { code: 'MATERNITY', labelFr: 'Congé maternité', labelAr: 'عطلة أمومة', paid: true, accrues: false, requiresJustification: true, defaultDurationDays: 98, order: 7 },
  { code: 'UNPAID', labelFr: 'Congé sans solde', labelAr: 'عطلة بدون أجر', paid: false, accrues: false, requiresJustification: false, order: 8 },
];

/** Crée (idempotent) les types de congé par défaut s'ils n'existent pas. */
export async function seedDefaultLeaveTypesAction(): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const tenantId = s.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    for (const t of DEFAULT_LEAVE_TYPES) {
      await tx.leaveType.upsert({
        where: { tenantId_code: { tenantId, code: t.code } },
        create: { tenantId, ...t },
        update: {}, // ne pas écraser une personnalisation existante
      });
    }
  });
  revalidatePath('/admin/leave');
  return { ok: true };
}

export async function createLeaveRequestAction(fd: FormData): Promise<Result> {
  // La vie scolaire enregistre les absences (étape 1 du workflow) ; l'approbation
  // reste réservée à l'admin/direction (reviewLeaveRequestAction → guard()).
  const s = await guardRoles(ABSENCE_ROLES);
  if (!s) return { ok: false, error: 'Non autorisé' };
  const tenantId = s.user.tenantId;
  const personId = str(fd, 'personId');
  const leaveTypeId = str(fd, 'leaveTypeId');
  const start = str(fd, 'startDate');
  const end = str(fd, 'endDate');
  if (!personId || !leaveTypeId || !start || !end) return { ok: false, error: 'Champs requis manquants.' };
  const startDate = new Date(`${start}T00:00:00.000Z`);
  const endDate = new Date(`${end}T00:00:00.000Z`);
  if (endDate < startDate) return { ok: false, error: 'La date de fin précède la date de début.' };
  // Portée dans la journée : entière, matin, après-midi ou n séances.
  const rawPart = str(fd, 'dayPart');
  const dayPart: DayPart = ['FULL', 'AM', 'PM', 'SESSIONS'].includes(rawPart ?? '')
    ? (rawPart as DayPart)
    : 'FULL';
  const sessionCount = dayPart === 'SESSIONS' ? Number(str(fd, 'sessionCount') ?? 0) || 0 : null;
  if (dayPart === 'SESSIONS' && (sessionCount ?? 0) <= 0) {
    return { ok: false, error: 'Indiquez le nombre de séances.' };
  }
  const days = leaveDays(workingDaysBetween(startDate, endDate), dayPart, sessionCount);

  try {
    const created = await withTenant(tenantId, async (tx) => {
      // Cohérence : pas de chevauchement avec une demande active du même employé.
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
          tenantId,
          personId,
          leaveTypeId,
          startDate,
          endDate,
          days,
          dayPart,
          sessionCount,
          reason: str(fd, 'reason') ?? null,
          status: 'PENDING',
        },
        include: {
          person: { select: { firstName: true, lastName: true, type: true } },
          leaveType: { select: { labelFr: true } },
        },
      });
      // Absence d'un enseignant → alerte vie scolaire/direction (remplacement).
      if (r.person.type === 'TEACHER') {
        await alertTeacherAbsence(tx, tenantId, {
          leaveId: r.id,
          teacherName: `${r.person.lastName} ${r.person.firstName}`,
          typeLabel: r.leaveType.labelFr,
          start: startDate,
          end: endDate,
        });
      }
      await logAudit(tx, { tenantId, userId: s.user.id, action: 'create', entityType: 'LeaveRequest', entityId: r.id, after: { personId, leaveTypeId, days } });
      return r.id;
    });
    revalidatePath('/admin/leave');
    return { ok: true, id: created };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

export async function reviewLeaveRequestAction(
  id: string,
  decision: 'APPROVED' | 'REJECTED',
  comment?: string,
): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const tenantId = s.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const req = await tx.leaveRequest.findUnique({
        where: { id },
        include: { person: { select: { contacts: true } }, leaveType: { select: { labelFr: true, code: true } } },
      });
      if (!req) throw new Error('Demande introuvable.');
      await tx.leaveRequest.update({
        where: { id },
        data: { status: decision, reviewedByUserId: s.user.id, reviewedAt: new Date(), decisionComment: comment ?? null },
      });
      // Approbation → alimente le Pointage personnel (absence/retard) sur la période.
      if (decision === 'APPROVED') {
        await syncStaffAttendanceFromLeave(tx, tenantId, s.user.id, {
          personId: req.personId,
          startDate: req.startDate,
          endDate: req.endDate,
          code: req.leaveType.code,
          typeLabel: req.leaveType.labelFr,
        });
        // …et marque les séances concernées comme à pourvoir dans l'EDT.
        await markAbsentSessions(tx, tenantId, s.user.id, {
          personId: req.personId,
          startDate: req.startDate,
          endDate: req.endDate,
          dayPart: req.dayPart as DayPart,
          sessionCount: req.sessionCount,
          typeLabel: req.leaveType.labelFr,
        });
      }
      // Notifie l'employé de la décision.
      const tenant = await tx.tenant.findFirst({ select: { localeDefault: true } });
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      await sendNotifications(tx, tenantId, tenant?.localeDefault ?? 'fr', [
        {
          recipient: parentRecipient(req.person.contacts),
          template: decision === 'APPROVED' ? 'leave.approved' : 'leave.rejected',
          data: { type: req.leaveType.labelFr, start: fmt(req.startDate), end: fmt(req.endDate), comment: comment ?? '' },
          studentId: null,
          relatedType: 'LeaveRequest',
          relatedId: id,
        },
      ]);
      await logAudit(tx, { tenantId, userId: s.user.id, action: 'review', entityType: 'LeaveRequest', entityId: id, after: { decision } });
    });
    revalidatePath('/admin/leave');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/** Jour de la semaine d'une date UTC, au format de TimetableEntry. */
const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

/**
 * Marque les séances du professeur pendant son absence approuvée : un
 * TimetableOverride sans remplaçant, en attente de décision, que l’écran des
 * remplacements présente comme « à pourvoir ». Une séance déjà décidée
 * (remplaçant affecté, cours annulé) n'est jamais écrasée, et rien n'est
 * visible des familles tant que la direction n’a pas approuvé.
 */
async function markAbsentSessions(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userId: string,
  leave: {
    personId: string;
    startDate: Date;
    endDate: Date;
    dayPart: DayPart;
    sessionCount: number | null;
    typeLabel: string;
  },
): Promise<void> {
  const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });
  if (!year) return;
  const entries = await tx.timetableEntry.findMany({
    where: { teacherId: leave.personId, academicYearId: year.id },
    select: { id: true, dayOfWeek: true, slot: { select: { startTime: true, order: true } } },
  });
  if (entries.length === 0) return;

  let remaining = leave.dayPart === 'SESSIONS' ? Math.max(0, leave.sessionCount ?? 0) : Number.POSITIVE_INFINITY;
  const d = new Date(
    Date.UTC(leave.startDate.getUTCFullYear(), leave.startDate.getUTCMonth(), leave.startDate.getUTCDate()),
  );
  const last = new Date(
    Date.UTC(leave.endDate.getUTCFullYear(), leave.endDate.getUTCMonth(), leave.endDate.getUTCDate()),
  );
  while (d <= last && remaining > 0) {
    const code = DOW[d.getUTCDay()];
    const daySessions = entries
      .filter((e) => e.dayOfWeek === code && slotInPart(e.slot.startTime, leave.dayPart))
      .sort((a, b) => a.slot.order - b.slot.order);
    for (const e of daySessions) {
      if (remaining <= 0) break;
      const date = new Date(d);
      const existing = await tx.timetableOverride.findUnique({
        where: { entryId_date: { entryId: e.id, date } },
        select: { id: true },
      });
      if (!existing) {
        await tx.timetableOverride.create({
          data: {
            tenantId,
            entryId: e.id,
            date,
            kind: 'SUBSTITUTION',
            substituteTeacherId: null,
            reason: `Absence : ${leave.typeLabel}`,
            approvalStatus: 'PENDING',
            createdByUserId: userId,
          },
        });
      }
      remaining -= 1;
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

/**
 * Statut de pointage déduit du type de congé/absence.
 * - Les types « Absence » (justifiée ou non) → ABSENT : la justification ne
 *   change pas le fait que l'employé était absent (elle reste en note).
 * - Le retard → LATE.
 * - Les congés planifiés (maladie, annuel, maternité, sans solde, exceptionnel)
 *   → LEAVE.
 */
const STAFF_STATUS_BY_CODE: Record<string, 'ABSENT' | 'LATE' | 'LEAVE'> = {
  LATE: 'LATE',
  JUSTIFIED: 'ABSENT',
  UNJUSTIFIED: 'ABSENT',
  ANNUAL: 'LEAVE',
  UNPAID: 'LEAVE',
  MATERNITY: 'LEAVE',
  SICK: 'LEAVE',
  EXCEPTIONAL: 'LEAVE',
};

/**
 * Reporte une absence/retard approuvé(e) dans le Pointage personnel : un
 * enregistrement StaffAttendance par jour de la période (dimanche exclu), au
 * statut déduit du type. Les jours verrouillés (déduction manuelle) sont
 * préservés.
 */
async function syncStaffAttendanceFromLeave(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userId: string,
  leave: { personId: string; startDate: Date; endDate: Date; code: string; typeLabel: string },
): Promise<void> {
  const status = STAFF_STATUS_BY_CODE[leave.code] ?? 'ABSENT';
  const note = `Congé approuvé : ${leave.typeLabel}`;
  const d = new Date(
    Date.UTC(leave.startDate.getUTCFullYear(), leave.startDate.getUTCMonth(), leave.startDate.getUTCDate()),
  );
  const last = new Date(
    Date.UTC(leave.endDate.getUTCFullYear(), leave.endDate.getUTCMonth(), leave.endDate.getUTCDate()),
  );
  while (d <= last) {
    if (d.getUTCDay() !== 0) {
      const date = new Date(d);
      const existing = await tx.staffAttendance.findUnique({
        where: { personId_date: { personId: leave.personId, date } },
        select: { id: true, deductionLocked: true },
      });
      if (existing) {
        if (!existing.deductionLocked) {
          await tx.staffAttendance.update({ where: { id: existing.id }, data: { status, note } });
        }
      } else {
        await tx.staffAttendance.create({
          data: { tenantId, personId: leave.personId, date, status, note, recordedByUserId: userId },
        });
      }
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

/**
 * Annule une demande d'absence et REVERSE tout ce qui en découle : suppression
 * des remplacements/annulations dans l'EDT, notification de la présence du prof
 * (remplaçants + parents + élèves), retrait des heures sup auto, et rétablissement
 * de la présence dans le Pointage personnel.
 */
export async function cancelLeaveRequestAction(id: string): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const tenantId = s.user.tenantId;
  const fromUserId = s.user.id;
  try {
    await withTenant(tenantId, async (tx) => {
      const leave = await tx.leaveRequest.findUnique({
        where: { id },
        include: { person: { select: { firstName: true, lastName: true, type: true } } },
      });
      if (!leave) throw new Error('Demande introuvable.');

      await tx.leaveRequest.update({ where: { id }, data: { status: 'CANCELLED' } });

      // Rétablit la présence : retire les pointages issus de cette absence
      // (non verrouillés) sur la période.
      await tx.staffAttendance.deleteMany({
        where: {
          personId: leave.personId,
          date: { gte: leave.startDate, lte: leave.endDate },
          note: { startsWith: 'Congé approuvé' },
          deductionLocked: false,
        },
      });

      if (leave.person.type === 'TEACHER') {
        await revertTeacherSubstitutions(tx, {
          tenantId,
          fromUserId,
          teacherId: leave.personId,
          teacherName: `${leave.person.lastName} ${leave.person.firstName}`,
          startDate: leave.startDate,
          endDate: leave.endDate,
        });
      }

      await logAudit(tx, {
        tenantId,
        userId: fromUserId,
        action: 'cancel_leave',
        entityType: 'LeaveRequest',
        entityId: id,
      });
    });
    revalidatePath('/admin/leave');
    revalidatePath(`/admin/leave/${id}/remplacements`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/**
 * Reverse les remplacements/annulations d'un prof sur une période : notifie la
 * présence (remplaçants + parents/élèves des classes concernées), retire les
 * heures sup auto, puis SUPPRIME les overrides (EDT rétabli).
 */
async function revertTeacherSubstitutions(
  tx: Prisma.TransactionClient,
  args: { tenantId: string; fromUserId: string; teacherId: string; teacherName: string; startDate: Date; endDate: Date },
): Promise<void> {
  const { tenantId, fromUserId, teacherName } = args;
  const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });
  if (!year) return;
  const entries = await tx.timetableEntry.findMany({
    where: { teacherId: args.teacherId, academicYearId: year.id },
    select: { id: true },
  });
  const entryIds = entries.map((e) => e.id);
  if (entryIds.length === 0) return;

  const overrides = await tx.timetableOverride.findMany({
    where: { entryId: { in: entryIds }, date: { gte: args.startDate, lte: args.endDate } },
    include: {
      entry: {
        select: {
          slot: { select: { startTime: true, endTime: true } },
          subject: { select: { label: true, labelAr: true } },
          class: { select: { id: true, name: true, nameAr: true } },
        },
      },
      substituteTeacher: { select: { firstName: true, lastName: true } },
    },
  });
  if (overrides.length === 0) return;

  const locale = (await tx.tenant.findFirst({ select: { localeDefault: true } }))?.localeDefault ?? 'fr';
  const items: NotifyItem[] = [];

  // Cache parents/élèves par classe (une classe peut avoir plusieurs séances).
  const familyByClass = new Map<
    string,
    { studentId: string; childName: string; parents: { userId: string | null; email: string | null; contacts: unknown }[]; studentUserId: string | null; studentEmail: string | null; studentContacts: unknown }[]
  >();
  async function familiesOf(classId: string) {
    if (familyByClass.has(classId)) return familyByClass.get(classId)!;
    const enrollments = await tx.enrollment.findMany({
      where: { classId, status: 'ACTIVE' },
      select: {
        student: {
          select: {
            id: true, firstName: true, lastName: true, contacts: true,
            userPersons: { select: { userId: true, user: { select: { email: true } } } },
            relationsAsChild: { select: { parent: { select: { contacts: true, userPersons: { select: { userId: true, user: { select: { email: true } } } } } } } },
          },
        },
      },
    });
    const rows = enrollments.map((e) => ({
      studentId: e.student.id,
      childName: `${e.student.firstName} ${e.student.lastName}`,
      studentUserId: e.student.userPersons[0]?.userId ?? null,
      studentEmail: e.student.userPersons[0]?.user?.email ?? null,
      studentContacts: e.student.contacts,
      parents: e.student.relationsAsChild.map((r) => ({
        userId: r.parent.userPersons[0]?.userId ?? null,
        email: r.parent.userPersons[0]?.user?.email ?? null,
        contacts: r.parent.contacts,
      })),
    }));
    familyByClass.set(classId, rows);
    return rows;
  }

  for (const o of overrides) {
    const dateLabel = fmtDate(o.date);
    const slotLabel = `${o.entry.slot.startTime}–${o.entry.slot.endTime}`;
    const subjectName = o.entry.subject?.label ?? '—';
    const className = o.entry.class.name;

    // Remplaçant : prévenu que son remplacement est annulé.
    if (o.kind === 'SUBSTITUTION' && o.substituteTeacherId) {
      const subUser = await tx.userPerson.findFirst({ where: { personId: o.substituteTeacherId }, select: { userId: true } });
      const body = renderTemplate('substitution.reverted', { date: dateLabel, slot: slotLabel, subject: subjectName, class: className, teacher: teacherName }, locale);
      if (subUser?.userId) {
        await sendDirectMessage(tx, { tenantId, fromUserId, toUserId: subUser.userId, subject: `Remplacement annulé — ${dateLabel}`, body });
      }
    }

    // Parents/élèves : seulement si l'override était APPROUVÉ (donc communiqué).
    if (o.approvalStatus === 'APPROVED') {
      const families = await familiesOf(o.entry.class.id);
      for (const f of families) {
        const data = { date: dateLabel, slot: slotLabel, subject: subjectName, child: f.childName };
        const body = renderTemplate('substitution.maintained', data, locale);
        const subject = `Cours maintenu — ${dateLabel}`;
        for (const p of f.parents) {
          if (p.userId) await sendDirectMessage(tx, { tenantId, fromUserId, toUserId: p.userId, subject, body });
          items.push({ channel: 'EMAIL', recipient: emailRecipient(p.contacts, p.email), template: 'substitution.maintained', data, studentId: f.studentId, relatedType: 'TimetableOverride', relatedId: o.id });
          items.push({ recipient: parentRecipient(p.contacts), template: 'substitution.maintained', data, studentId: f.studentId, relatedType: 'TimetableOverride', relatedId: o.id });
        }
        if (f.studentUserId) await sendDirectMessage(tx, { tenantId, fromUserId, toUserId: f.studentUserId, subject, body });
        items.push({ channel: 'EMAIL', recipient: emailRecipient(f.studentContacts, f.studentEmail), template: 'substitution.maintained', data, studentId: f.studentId, relatedType: 'TimetableOverride', relatedId: o.id });
      }
    }

    // Retire l'heure sup auto (DECLARED) liée à cet override.
    await tx.overtimeEntry.deleteMany({ where: { source: 'SUBSTITUTION', sourceRef: o.id, status: 'DECLARED' } });
  }

  if (items.length) await sendNotifications(tx, tenantId, locale, items);

  // Supprime les overrides → l'EDT ne montre plus de remplacement/annulation.
  await tx.timetableOverride.deleteMany({
    where: { entryId: { in: entryIds }, date: { gte: args.startDate, lte: args.endDate } },
  });
}
