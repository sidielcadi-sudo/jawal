'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import type { Prisma } from '@/lib/db';
import {
  applyDiscount,
  computeSiblingDiscount,
  readSiblingDiscountPct,
} from '@/lib/enrollment-discount';
import { addressesMatch } from '@/lib/address';
import { sendEnrollmentActivationEmails } from '@/lib/enrollment-activation-email';

type Result = { ok: true } | { ok: false; error: string };

/**
 * Ouvre un dossier d'admission (EN_ATTENTE) pour un candidat fraîchement créé.
 * Appelé juste après la création de la Person (type STUDENT) par le formulaire
 * « Nouvelle inscription ». L'élève n'apparaîtra dans le menu Élèves qu'une
 * fois affecté à une classe.
 */
export async function createAdmissionEnrollmentAction(
  studentId: string,
  academicYearId: string,
  levelId: string,
  notes?: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  if (!studentId || !academicYearId || !levelId)
    return { ok: false, error: 'Niveau demandé et année requis.' };
  const tenantId = session.user.tenantId;
  try {
    const id = await withTenant(tenantId, async (tx) => {
      const existing = await tx.enrollment.findUnique({
        where: { studentId_academicYearId: { studentId, academicYearId } },
      });
      if (existing) return existing.id;
      const created = await tx.enrollment.create({
        data: {
          tenantId,
          studentId,
          academicYearId,
          levelId,
          status: 'DRAFT',
          notes: notes && notes.trim() ? notes.trim() : null,
          createdByUserId: session.user.id,
        },
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'openAdmission',
        entityType: 'Enrollment',
        entityId: created.id,
        after: { studentId, academicYearId, levelId },
      });
      return created.id;
    });
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

// États « avant décision » (phase dossier/pièces).
const PRE_DECISION = ['DRAFT', 'DOCUMENTS_MANQUANTS', 'DOSSIER_COMPLET'] as const;
// États qui « consomment » une place pour le calcul du quota.
const PLACE_TAKEN = ['ACCEPTE', 'INSCRIPTION_VALIDEE', 'AFFECTE', 'ACTIVE'] as const;

function revalidate(id: string) {
  revalidatePath('/admin/enrollments');
  revalidatePath(`/admin/enrollments/${id}`);
}

/**
 * Recalcule le statut « pièces » d'un dossier (auto) : DOSSIER_COMPLET si
 * toutes les pièces requises (du niveau + globales) ont une pièce VALID,
 * sinon DOCUMENTS_MANQUANTS. N'agit que sur les états avant décision.
 */
async function recomputeDossierStatus(
  tx: Prisma.TransactionClient,
  enrollmentId: string,
): Promise<void> {
  const enr = await tx.enrollment.findUnique({ where: { id: enrollmentId } });
  if (!enr) return;
  if (!(PRE_DECISION as readonly string[]).includes(enr.status)) return;

  const required = await tx.requiredDocument.findMany({
    where: {
      active: true,
      required: true,
      OR: [{ levelId: null }, { levelId: enr.levelId }],
    },
    select: { id: true },
  });
  let complete = true;
  if (required.length > 0) {
    const valid = await tx.enrollmentDocument.findMany({
      where: {
        enrollmentId,
        status: 'VALID',
        requiredDocumentId: { in: required.map((r) => r.id) },
      },
      select: { requiredDocumentId: true },
    });
    const validSet = new Set(valid.map((v) => v.requiredDocumentId));
    complete = required.every((r) => validSet.has(r.id));
  }
  const next = complete ? 'DOSSIER_COMPLET' : 'DOCUMENTS_MANQUANTS';
  if (enr.status !== next) {
    await tx.enrollment.update({ where: { id: enrollmentId }, data: { status: next } });
  }
}

/** Valide / invalide une pièce déposée, puis recalcule le statut du dossier. */
export async function validateDocumentAction(
  docId: string,
  status: 'VALID' | 'INVALID',
  note?: string,
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  const tenantId = session.user.tenantId;
  try {
    const enrollmentId = await withTenant(tenantId, async (tx) => {
      const doc = await tx.enrollmentDocument.findUnique({ where: { id: docId } });
      if (!doc) throw new Error('Pièce introuvable.');
      await tx.enrollmentDocument.update({
        where: { id: docId },
        data: {
          status,
          note: note ?? null,
          validatedAt: new Date(),
          validatedByUserId: session.user.id,
        },
      });
      await recomputeDossierStatus(tx, doc.enrollmentId);
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'validateDocument',
        entityType: 'EnrollmentDocument',
        entityId: docId,
        after: { status },
      });
      return doc.enrollmentId;
    });
    revalidate(enrollmentId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/**
 * Accepte un dossier (décision admin) : vérifie le quota du niveau × année,
 * génère l'échéance « frais d'inscription » et passe le dossier en ACCEPTE.
 */
export async function acceptEnrollmentAction(
  enrollmentId: string,
  discountPctOverride?: number,
  discountReason?: string,
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const enr = await tx.enrollment.findUnique({ where: { id: enrollmentId } });
      if (!enr) throw new Error('Dossier introuvable.');
      if (!(PRE_DECISION as readonly string[]).includes(enr.status)) {
        throw new Error('Le dossier ne peut être accepté que depuis la phase d’instruction.');
      }

      // #10 — Pièces obligatoires : toutes les pièces required=true du niveau
      // doivent avoir été déposées (et non invalidées) avant l'acceptation.
      const requiredDocs = await tx.requiredDocument.findMany({
        where: {
          active: true,
          required: true,
          OR: [{ levelId: null }, { levelId: enr.levelId }],
        },
        select: { id: true, labelFr: true },
      });
      if (requiredDocs.length > 0) {
        const deposited = await tx.enrollmentDocument.findMany({
          where: { enrollmentId, status: { not: 'INVALID' } },
          select: { requiredDocumentId: true },
        });
        const depositedSet = new Set(
          deposited.map((d) => d.requiredDocumentId).filter((x): x is string => !!x),
        );
        const missing = requiredDocs.filter((rd) => !depositedSet.has(rd.id));
        if (missing.length > 0) {
          throw new Error(
            `Pièces obligatoires manquantes : ${missing.map((m) => m.labelFr).join(', ')}.`,
          );
        }
      }

      // #3 — L'élève doit partager l'adresse d'au moins un de ses parents/tuteurs.
      const student = await tx.person.findUnique({
        where: { id: enr.studentId },
        select: { address: true },
      });
      const rels = await tx.personRelation.findMany({
        where: { childId: enr.studentId },
        select: { parent: { select: { address: true } } },
      });
      const studentAddress = student?.address;
      const matchesAParent = rels.some((r) => addressesMatch(studentAddress, r.parent.address));
      if (rels.length === 0) {
        throw new Error("L'élève doit être rattaché à au moins un parent ou tuteur.");
      }
      if (!matchesAParent) {
        throw new Error(
          "L'adresse de l'élève doit correspondre à celle d'un de ses parents/tuteurs.",
        );
      }

      // Contrôle du quota (s'il est défini pour ce niveau × année).
      const quota = await tx.admissionQuota.findUnique({
        where: {
          academicYearId_levelId: { academicYearId: enr.academicYearId, levelId: enr.levelId },
        },
      });
      if (quota && quota.capacity > 0) {
        const taken = await tx.enrollment.count({
          where: {
            academicYearId: enr.academicYearId,
            levelId: enr.levelId,
            status: { in: [...PLACE_TAKEN] },
          },
        });
        if (taken >= quota.capacity) {
          throw new Error(`Plus de place : quota ${quota.capacity} atteint pour ce niveau.`);
        }
      }

      // Réduction : auto (fratrie) sauf saisie manuelle.
      const childRels = await tx.personRelation.findMany({
        where: { childId: enr.studentId },
        select: { parentId: true },
      });
      const parentIds = childRels.map((r) => r.parentId);
      let siblingsActive = 0;
      if (parentIds.length > 0) {
        const sib = await tx.personRelation.findMany({
          where: { parentId: { in: parentIds }, childId: { not: enr.studentId } },
          distinct: ['childId'],
          select: { childId: true },
        });
        const ids = sib.map((s) => s.childId);
        if (ids.length > 0)
          siblingsActive = await tx.enrollment.count({
            where: { studentId: { in: ids }, academicYearId: enr.academicYearId, status: 'ACTIVE' },
          });
      }
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
      const auto = computeSiblingDiscount(siblingsActive, readSiblingDiscountPct(tenant?.settings));
      const finalPct =
        discountPctOverride !== undefined && discountPctOverride >= 0 ? discountPctOverride : auto.pct;

      // Échéancier complet depuis la grille (cycle/niveau), réduction appliquée.
      if (!enr.feesGenerated) {
        const fees = await tx.feeScheduleItem.findMany({
          where: { academicYearId: enr.academicYearId, levelId: enr.levelId },
        });
        const yearStart = (
          await tx.academicYear.findUniqueOrThrow({ where: { id: enr.academicYearId } })
        ).startDate;
        for (const fee of fees) {
          const discounted = applyDiscount(Number(fee.totalAmount), finalPct);
          const per = Math.round((discounted / fee.installmentCount) * 100) / 100;
          for (let i = 0; i < fee.installmentCount; i++) {
            const m = (fee.firstDueMonth - 1 + i) % 12;
            const yo = Math.floor((fee.firstDueMonth - 1 + i) / 12);
            await tx.installment.create({
              data: {
                tenantId,
                studentId: enr.studentId,
                feeScheduleItemId: fee.id,
                label: `${fee.label} (${i + 1}/${fee.installmentCount})`,
                amount: per,
                dueDate: new Date(Date.UTC(yearStart.getUTCFullYear() + yo, m, 5)),
                status: 'PENDING',
              },
            });
          }
        }
      }

      await tx.enrollment.update({
        where: { id: enrollmentId },
        data: {
          status: 'ACCEPTE',
          decidedAt: new Date(),
          decidedByUserId: session.user.id,
          discountPct: finalPct > 0 ? finalPct : null,
          discountReason: discountReason ?? null,
          siblingRank: auto.rank,
          feesGenerated: true,
        },
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'acceptEnrollment',
        entityType: 'Enrollment',
        entityId: enrollmentId,
        after: { discountPct: finalPct },
      });
    });
    revalidate(enrollmentId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/**
 * Encaisse une échéance (paiement complet de la ligne) : crée le Payment,
 * passe l'échéance à PAID. Si c'est les frais d'inscription et que le dossier
 * est ACCEPTÉ, il avance automatiquement à INSCRIPTION_VALIDEE.
 */
export async function recordInstallmentPaymentAction(
  installmentId: string,
  method: 'CASH' | 'CHEQUE' | 'TRANSFER' | 'CMI' | 'STRIPE' | 'OTHER',
  reference?: string,
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  const tenantId = session.user.tenantId;
  try {
    const enrollmentId = await withTenant(tenantId, async (tx) => {
      const inst = await tx.installment.findUnique({
        where: { id: installmentId },
        include: { payments: true },
      });
      if (!inst) throw new Error('Échéance introuvable.');
      const already = inst.payments.reduce((s, p) => s + Number(p.amount), 0);
      const remaining = Math.max(0, Number(inst.amount) - already);
      if (remaining <= 0) throw new Error('Échéance déjà payée.');
      await tx.payment.create({
        data: {
          tenantId,
          installmentId,
          amount: remaining,
          method,
          reference: reference ?? null,
          recordedByUserId: session.user.id,
        },
      });
      await tx.installment.update({ where: { id: installmentId }, data: { status: 'PAID' } });

      // Avancement automatique si frais d'inscription payés.
      const isInscription = /inscription/i.test(inst.label);
      const enr = await tx.enrollment.findFirst({
        where: { studentId: inst.studentId, status: 'ACCEPTE' },
      });
      const enrollmentId = enr?.id ?? null;
      if (enr && isInscription) {
        await tx.enrollment.update({
          where: { id: enr.id },
          data: { status: 'INSCRIPTION_VALIDEE' },
        });
      }
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'recordPayment',
        entityType: 'Installment',
        entityId: installmentId,
        after: { amount: remaining, method },
      });
      return enrollmentId;
    });
    if (enrollmentId) revalidate(enrollmentId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/** Refuse un dossier (motif obligatoire). Libère la place. */
export async function refuseEnrollmentAction(
  enrollmentId: string,
  reason: string,
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  if (!reason || reason.trim().length === 0)
    return { ok: false, error: 'Motif de refus obligatoire.' };
  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const enr = await tx.enrollment.findUnique({ where: { id: enrollmentId } });
      if (!enr) throw new Error('Dossier introuvable.');
      if (['ACTIVE', 'AFFECTE', 'WITHDRAWN', 'GRADUATED'].includes(enr.status)) {
        throw new Error('Dossier déjà affecté/clos : utilisez la radiation.');
      }
      // Annule une éventuelle échéance d'inscription impayée.
      await tx.installment.updateMany({
        where: { studentId: enr.studentId, status: { in: ['PENDING', 'PARTIAL'] } },
        data: { status: 'CANCELLED' },
      });
      await tx.enrollment.update({
        where: { id: enrollmentId },
        data: {
          status: 'REFUSE',
          refusalReason: reason.trim(),
          decidedAt: new Date(),
          decidedByUserId: session.user.id,
        },
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'refuseEnrollment',
        entityType: 'Enrollment',
        entityId: enrollmentId,
        after: { reason: reason.trim() },
      });
    });
    revalidate(enrollmentId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/**
 * Confirme le paiement des frais d'inscription : encaisse l'échéance
 * « Frais d'inscription » et passe le dossier en INSCRIPTION_VALIDEE.
 */
export async function confirmInscriptionPaymentAction(
  enrollmentId: string,
  method: 'CASH' | 'CHEQUE' | 'TRANSFER' | 'CMI' | 'STRIPE' | 'OTHER' = 'CASH',
  reference?: string,
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const enr = await tx.enrollment.findUnique({ where: { id: enrollmentId } });
      if (!enr) throw new Error('Dossier introuvable.');
      if (enr.status !== 'ACCEPTE') {
        throw new Error('Le paiement ne peut être confirmé que sur un dossier ACCEPTÉ.');
      }
      const inscription = await tx.installment.findFirst({
        where: {
          studentId: enr.studentId,
          label: 'Frais d’inscription',
          status: { in: ['PENDING', 'PARTIAL'] },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (inscription && Number(inscription.amount) > 0) {
        await tx.payment.create({
          data: {
            tenantId,
            installmentId: inscription.id,
            amount: inscription.amount,
            method,
            reference: reference ?? null,
            recordedByUserId: session.user.id,
          },
        });
        await tx.installment.update({ where: { id: inscription.id }, data: { status: 'PAID' } });
      }
      await tx.enrollment.update({
        where: { id: enrollmentId },
        data: { status: 'INSCRIPTION_VALIDEE' },
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'confirmInscriptionPayment',
        entityType: 'Enrollment',
        entityId: enrollmentId,
        after: { method },
      });
    });
    revalidate(enrollmentId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/**
 * Validation manuelle du paiement des frais d'inscription : fait passer le
 * dossier ACCEPTE → INSCRIPTION_VALIDEE (« Payé »). Donne la main à l'admin
 * même si l'encaissement a été fait hors application.
 */
export async function validatePaymentAction(enrollmentId: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const enr = await tx.enrollment.findUnique({ where: { id: enrollmentId } });
      if (!enr) throw new Error('Dossier introuvable.');
      if (enr.status !== 'ACCEPTE')
        throw new Error('La validation du paiement n’est possible que sur un dossier ACCEPTÉ.');
      await tx.enrollment.update({
        where: { id: enrollmentId },
        data: { status: 'INSCRIPTION_VALIDEE' },
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'validatePayment',
        entityType: 'Enrollment',
        entityId: enrollmentId,
      });
    });
    revalidate(enrollmentId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/** Affecte une classe (capacité contrôlée) → AFFECTE + StudentClass. */
export async function affectEnrollmentAction(
  enrollmentId: string,
  classId: string,
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const enr = await tx.enrollment.findUnique({ where: { id: enrollmentId } });
      if (!enr) throw new Error('Dossier introuvable.');
      if (enr.status !== 'INSCRIPTION_VALIDEE') {
        throw new Error('Affectation possible uniquement après validation du paiement.');
      }
      const cls = await tx.class.findUnique({
        where: { id: classId },
        include: { _count: { select: { students: { where: { unenrolledAt: null } } } } },
      });
      if (!cls) throw new Error('Classe introuvable.');
      if (cls.academicYearId !== enr.academicYearId)
        throw new Error('La classe n’est pas de cette année scolaire.');
      if (cls.levelId !== enr.levelId) throw new Error('La classe n’est pas au bon niveau.');
      if (cls._count.students >= cls.capacity)
        throw new Error(`Classe pleine (capacité ${cls.capacity}).`);

      await tx.studentClass.upsert({
        where: { studentId_classId: { studentId: enr.studentId, classId } },
        update: { unenrolledAt: null },
        create: { tenantId, studentId: enr.studentId, classId },
      });
      await tx.enrollment.update({
        where: { id: enrollmentId },
        data: { status: 'AFFECTE', classId },
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'affectEnrollment',
        entityType: 'Enrollment',
        entityId: enrollmentId,
        after: { classId },
      });
    });
    revalidate(enrollmentId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/**
 * Active le dossier (AFFECTE → ACTIVE). L'échéancier a déjà été généré à
 * l'acceptation ; l'activation finalise l'intégration de l'élève.
 */
export async function activateEnrollmentAction(enrollmentId: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const enr = await tx.enrollment.findUnique({ where: { id: enrollmentId } });
      if (!enr) throw new Error('Dossier introuvable.');
      if (enr.status !== 'AFFECTE')
        throw new Error('Activation possible uniquement après affectation.');
      await tx.enrollment.update({
        where: { id: enrollmentId },
        data: { status: 'ACTIVE', validatedAt: new Date(), validatedByUserId: session.user.id },
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'activateEnrollment',
        entityType: 'Enrollment',
        entityId: enrollmentId,
      });
    });
    // E-mail de confirmation aux parents (PDF + identifiants portail).
    // Best-effort hors transaction : ne doit jamais bloquer l'activation.
    await sendEnrollmentActivationEmails({ tenantId, enrollmentId });
    revalidate(enrollmentId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
