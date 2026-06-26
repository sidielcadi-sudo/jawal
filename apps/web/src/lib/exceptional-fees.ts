import 'server-only';
import type { Prisma } from '@/lib/db';

/**
 * Frais exceptionnels : ponctuels, ciblés (classe / élèves), optionnels ou
 * obligatoires. Une fois acceptés (ou obligatoires), une ligne `Installment`
 * est créée pour entrer dans le flux de paiement existant. Ils ne se mélangent
 * jamais aux mensualités (modèle distinct, jamais issus d'un FeeScheduleItem).
 */

type FeeForBilling = {
  id: string;
  label: string;
  amount: Prisma.Decimal | number;
  dueDate: Date | null;
  activityDate: Date | null;
  mandatory: boolean;
};

/** Date d'échéance de la ligne facturée : dueDate, sinon date d'activité, sinon aujourd'hui. */
function billingDueDate(fee: FeeForBilling): Date {
  return fee.dueDate ?? fee.activityDate ?? new Date();
}

/**
 * Crée la ligne `Installment` (ad hoc, hors échéancier) pour une affectation
 * et la rattache. Idempotent : ne recrée pas si déjà facturée.
 */
export async function billAssignment(
  tx: Prisma.TransactionClient,
  tenantId: string,
  assignment: { id: string; studentId: string; installmentId: string | null },
  fee: FeeForBilling,
): Promise<string> {
  if (assignment.installmentId) return assignment.installmentId;
  const inst = await tx.installment.create({
    data: {
      tenantId,
      studentId: assignment.studentId,
      feeScheduleItemId: null,
      label: fee.label,
      amount: fee.amount,
      dueDate: billingDueDate(fee),
      status: 'PENDING',
    },
  });
  await tx.exceptionalFeeAssignment.update({
    where: { id: assignment.id },
    data: { installmentId: inst.id },
  });
  return inst.id;
}

/** Élèves actifs d'une liste de classes (année active implicite via StudentClass). */
export async function studentsOfClasses(
  tx: Prisma.TransactionClient,
  classIds: string[],
): Promise<string[]> {
  if (classIds.length === 0) return [];
  const rows = await tx.studentClass.findMany({
    where: { classId: { in: classIds }, unenrolledAt: null },
    select: { studentId: true },
  });
  return rows.map((r) => r.studentId);
}

/**
 * Affecte un frais à un ensemble d'élèves (déduplication incluse).
 * NB : aucune facturation ici — « une fois créé, le frais n'est pas encore
 * facturé ». La facturation a lieu plus tard : à la publication (obligatoire)
 * ou à l'acceptation du parent (optionnel).
 * Frais obligatoire → consentement ACCEPTED (pas de choix parent).
 * Frais optionnel → consentement PENDING.
 * Retourne le nombre de nouvelles affectations créées.
 */
export async function assignStudents(
  tx: Prisma.TransactionClient,
  tenantId: string,
  fee: FeeForBilling,
  studentIds: string[],
): Promise<number> {
  const unique = [...new Set(studentIds)];
  let created = 0;
  for (const studentId of unique) {
    const existing = await tx.exceptionalFeeAssignment.findUnique({
      where: { exceptionalFeeId_studentId: { exceptionalFeeId: fee.id, studentId } },
      select: { id: true },
    });
    if (existing) continue;
    await tx.exceptionalFeeAssignment.create({
      data: {
        tenantId,
        exceptionalFeeId: fee.id,
        studentId,
        consent: fee.mandatory ? 'ACCEPTED' : 'PENDING',
        consentAt: fee.mandatory ? new Date() : null,
      },
    });
    created += 1;
  }
  return created;
}

/**
 * Facture toutes les affectations non encore facturées d'un frais.
 * Utilisé à la publication d'un frais OBLIGATOIRE (passe en « À payer »).
 */
export async function billFeeAssignments(
  tx: Prisma.TransactionClient,
  tenantId: string,
  fee: FeeForBilling,
): Promise<void> {
  const assigns = await tx.exceptionalFeeAssignment.findMany({
    where: { exceptionalFeeId: fee.id, installmentId: null, consent: { not: 'REFUSED' } },
    select: { id: true, studentId: true, installmentId: true },
  });
  for (const a of assigns) await billAssignment(tx, tenantId, a, fee);
}

/**
 * Applique la décision de consentement du parent.
 * ACCEPT → crée la ligne facturée (si absente). REFUSE → rien facturé ; si une
 * ligne avait été créée (ex. acceptation antérieure), elle est annulée.
 */
export async function applyConsent(
  tx: Prisma.TransactionClient,
  tenantId: string,
  assignment: { id: string; studentId: string; installmentId: string | null },
  fee: FeeForBilling,
  decision: 'ACCEPT' | 'REFUSE',
  userId: string,
): Promise<void> {
  if (decision === 'ACCEPT') {
    await billAssignment(tx, tenantId, assignment, fee);
    await tx.exceptionalFeeAssignment.update({
      where: { id: assignment.id },
      data: { consent: 'ACCEPTED', consentAt: new Date(), consentByUserId: userId },
    });
  } else {
    if (assignment.installmentId) {
      await tx.installment.update({
        where: { id: assignment.installmentId },
        data: { status: 'CANCELLED' },
      });
    }
    await tx.exceptionalFeeAssignment.update({
      where: { id: assignment.id },
      data: {
        consent: 'REFUSED',
        consentAt: new Date(),
        consentByUserId: userId,
        installmentId: null,
      },
    });
  }
}

/**
 * Frais exceptionnels en attente de décision pour un élève (côté parent).
 * Uniquement les frais PUBLISHED, non obligatoires, consentement PENDING.
 */
export async function loadStudentPendingFees(
  tx: Prisma.TransactionClient,
  studentId: string,
) {
  const rows = await tx.exceptionalFeeAssignment.findMany({
    where: {
      studentId,
      consent: 'PENDING',
      exceptionalFee: { status: 'PUBLISHED', mandatory: false },
    },
    include: {
      exceptionalFee: { include: { type: { select: { labelFr: true, labelAr: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((a) => ({
    assignmentId: a.id,
    feeId: a.exceptionalFeeId,
    label: a.exceptionalFee.label,
    description: a.exceptionalFee.description,
    amount: Number(a.exceptionalFee.amount),
    activityDate: a.exceptionalFee.activityDate,
    dueDate: a.exceptionalFee.dueDate,
    typeFr: a.exceptionalFee.type?.labelFr ?? null,
    typeAr: a.exceptionalFee.type?.labelAr ?? null,
  }));
}

/** Nombre de frais exceptionnels en attente de décision pour des élèves donnés (badge). */
export async function countPendingConsent(
  tx: Prisma.TransactionClient,
  studentIds: string[],
): Promise<number> {
  if (studentIds.length === 0) return 0;
  return tx.exceptionalFeeAssignment.count({
    where: {
      studentId: { in: studentIds },
      consent: 'PENDING',
      exceptionalFee: { status: 'PUBLISHED', mandatory: false },
    },
  });
}
