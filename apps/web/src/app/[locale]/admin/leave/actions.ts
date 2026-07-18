'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { requirePermission, requireRoleCode } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { workingDaysBetween } from '@/lib/leave';
import { sendNotifications, parentRecipient } from '@/lib/notify';
import { alertTeacherAbsence } from '@/lib/leave-alerts';

type Result = { ok: true } | { ok: false; error: string };

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
  const days = workingDaysBetween(startDate, endDate);

  try {
    await withTenant(tenantId, async (tx) => {
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
    });
    revalidatePath('/admin/leave');
    return { ok: true };
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
        include: { person: { select: { contacts: true } }, leaveType: { select: { labelFr: true } } },
      });
      if (!req) throw new Error('Demande introuvable.');
      await tx.leaveRequest.update({
        where: { id },
        data: { status: decision, reviewedByUserId: s.user.id, reviewedAt: new Date(), decisionComment: comment ?? null },
      });
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

export async function cancelLeaveRequestAction(id: string): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  await withTenant(s.user.tenantId, (tx) => tx.leaveRequest.update({ where: { id }, data: { status: 'CANCELLED' } }));
  revalidatePath('/admin/leave');
  return { ok: true };
}
