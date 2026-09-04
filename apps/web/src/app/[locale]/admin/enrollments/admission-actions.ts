'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import type { Prisma } from '@/lib/db';
import { computeSiblingDiscount } from '@/lib/enrollment-discount';
import { addressesMatch } from '@/lib/address';
import { buildInstallments, type FeeCategory } from '@/lib/fees';
import { discountsForFeeWhere } from '@/lib/discounts';
import { sendEnrollmentActivationEmails } from '@/lib/enrollment-activation-email';
import { sendNotifications, parentRecipient } from '@/lib/notify';
import { safeSendEmail } from '@/lib/email';
import { postInstallmentPayment } from '@/lib/accounting-hooks';

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
export type FeeLineInput = { feeId: string; discountRuleId: string | null; count: number };

export async function acceptEnrollmentAction(
  enrollmentId: string,
  feeLines: FeeLineInput[] = [],
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
      const auto = computeSiblingDiscount(siblingsActive, 0); // rang fratrie (info)

      // Échéancier : une ligne de frais par entrée, réduction + nb d'échéances
      // choisis à l'admission (verrou respecté). Frais annuels du niveau × année.
      let summaryPct: number | null = null;
      const summaryParts: string[] = [];
      if (!enr.feesGenerated && feeLines.length > 0) {
        const feeIdSet = feeLines.map((l) => l.feeId);
        const fees = await tx.feeScheduleItem.findMany({
          where: {
            id: { in: feeIdSet },
            academicYearId: enr.academicYearId,
            levelId: enr.levelId,
            kind: 'ANNUAL',
          },
        });
        const feeById = new Map(fees.map((f) => [f.id, f]));
        const yearStart = (
          await tx.academicYear.findUniqueOrThrow({ where: { id: enr.academicYearId } })
        ).startDate;

        for (const line of feeLines) {
          const fee = feeById.get(line.feeId);
          if (!fee) throw new Error('Frais inconnu pour ce niveau.');

          // Réduction : validée (active + rattachée à ce frais ou globale).
          let pct = 0;
          let discountLabel = '';
          if (line.discountRuleId) {
            const rule = await tx.discountRule.findFirst({
              where: { id: line.discountRuleId, ...discountsForFeeWhere(fee.id) },
            });
            if (!rule) throw new Error('Réduction invalide pour ce frais.');
            pct = Number(rule.pct);
            discountLabel = rule.label;
          }

          // Nb d'échéances : figé si verrouillé dans le paramétrage.
          const count = fee.installmentLocked
            ? fee.installmentCount
            : Math.min(24, Math.max(1, Math.floor(line.count || fee.installmentCount)));

          const installments = buildInstallments(
            {
              id: fee.id,
              label: fee.label,
              category: fee.category as FeeCategory,
              totalAmount: Number(fee.totalAmount),
              installmentCount: fee.installmentCount,
              installmentLocked: fee.installmentLocked,
              firstDueMonth: fee.firstDueMonth,
            },
            { pct, count, yearStart },
          );
          for (const inst of installments) {
            await tx.installment.create({
              data: {
                tenantId,
                studentId: enr.studentId,
                feeScheduleItemId: inst.feeScheduleItemId,
                label: inst.label,
                amount: inst.amount,
                dueDate: inst.dueDate,
                status: 'PENDING',
              },
            });
          }
          if (pct > 0) {
            summaryParts.push(`${fee.label} −${pct}%${discountLabel ? ` (${discountLabel})` : ''}`);
            if (fee.category === 'TUITION') summaryPct = pct;
          }
        }
      }

      await tx.enrollment.update({
        where: { id: enrollmentId },
        data: {
          status: 'ACCEPTE',
          decidedAt: new Date(),
          decidedByUserId: session.user.id,
          discountPct: summaryPct,
          discountReason: summaryParts.length > 0 ? summaryParts.join(' · ') : null,
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
        after: { discounts: summaryParts },
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
      const pay = await tx.payment.create({
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
      await postInstallmentPayment(tx, tenantId, installmentId, { id: pay.id, amount: remaining, method }, new Date(), session.user.id);

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

/**
 * Encaisse en une fois toutes les échéances d'une même date d'exigibilité
 * (le « Total » de l'échéancier). Crée un Payment par échéance non soldée.
 */
export async function recordGroupPaymentAction(
  installmentIds: string[],
  method: 'CASH' | 'CHEQUE' | 'TRANSFER' | 'CMI' | 'STRIPE' | 'OTHER',
  reference?: string,
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  if (installmentIds.length === 0) return { ok: false, error: 'Aucune échéance.' };
  const tenantId = session.user.tenantId;
  try {
    const enrollmentId = await withTenant(tenantId, async (tx) => {
      let advanced: string | null = null;
      for (const installmentId of installmentIds) {
        const inst = await tx.installment.findUnique({
          where: { id: installmentId },
          include: { payments: true },
        });
        if (!inst) continue;
        const already = inst.payments.reduce((s, p) => s + Number(p.amount), 0);
        const remaining = Math.max(0, Number(inst.amount) - already);
        if (remaining <= 0) continue;
        const pay = await tx.payment.create({
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
        await postInstallmentPayment(tx, tenantId, installmentId, { id: pay.id, amount: remaining, method }, new Date(), session.user.id);
        if (/inscription/i.test(inst.label)) {
          const enr = await tx.enrollment.findFirst({
            where: { studentId: inst.studentId, status: 'ACCEPTE' },
          });
          if (enr) {
            await tx.enrollment.update({
              where: { id: enr.id },
              data: { status: 'INSCRIPTION_VALIDEE' },
            });
            advanced = enr.id;
          }
        } else if (!advanced) {
          const enr = await tx.enrollment.findFirst({
            where: { studentId: inst.studentId },
            select: { id: true },
          });
          advanced = enr?.id ?? null;
        }
        await logAudit(tx, {
          tenantId,
          userId: session.user.id,
          action: 'recordPayment',
          entityType: 'Installment',
          entityId: installmentId,
          after: { amount: remaining, method, group: true },
        });
      }
      return advanced;
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
  // Emails à envoyer HORS transaction (parents disposant d'un accès portail).
  let emailTargets: { email: string; parentName: string }[] = [];
  let emailStudent = '';
  let emailTenant = '';
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

      // Notifie les parents (si contact) du refus.
      const student = await tx.person.findUnique({ where: { id: enr.studentId }, select: { firstName: true, lastName: true } });
      const rels = await tx.personRelation.findMany({ where: { childId: enr.studentId }, include: { parent: { select: { id: true, firstName: true, lastName: true, contacts: true } } } });
      const tenant = await tx.tenant.findFirst({ select: { localeDefault: true, name: true } });
      if (student && rels.length) {
        await sendNotifications(
          tx,
          tenantId,
          tenant?.localeDefault ?? 'fr',
          rels.map((r) => ({
            recipient: parentRecipient(r.parent.contacts),
            recipientName: `${r.parent.lastName} ${r.parent.firstName}`,
            template: 'enrollment.refused',
            data: { child: `${student.lastName} ${student.firstName}`, reason: reason.trim() },
            relatedType: 'Enrollment',
            relatedId: enrollmentId,
          })),
        );

        // Parents disposant d'un compte portail (User actif) → email (envoyé hors tx).
        emailStudent = `${student.lastName} ${student.firstName}`;
        emailTenant = tenant?.name ?? 'Établissement';
        const accounts = await tx.userPerson.findMany({
          where: { personId: { in: rels.map((r) => r.parent.id) } },
          select: { user: { select: { email: true, disabledAt: true } }, person: { select: { firstName: true, lastName: true } } },
        });
        emailTargets = accounts
          .filter((a) => a.user.email && !a.user.disabledAt)
          .map((a) => ({ email: a.user.email!, parentName: `${a.person.lastName} ${a.person.firstName}` }));
      }
    });

    // Envoi des emails de refus (hors transaction).
    for (const tgt of emailTargets) {
      await safeSendEmail({
        to: tgt.email,
        subject: `Demande d'inscription — ${emailTenant}`,
        html:
          `<p>Bonjour,</p>` +
          `<p>Nous vous informons que la demande d'inscription de <strong>${emailStudent}</strong> ` +
          `auprès de <strong>${emailTenant}</strong> n'a pas été retenue.</p>` +
          `<p><strong>Motif :</strong> ${reason.trim()}</p>` +
          `<p>Pour toute question, n'hésitez pas à contacter l'établissement.</p>`,
        text: `Demande d'inscription — ${emailTenant}\n\nLa demande d'inscription de ${emailStudent} n'a pas été retenue.\nMotif : ${reason.trim()}`,
      });
    }

    revalidate(enrollmentId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/**
 * Réinscrit un élève dont le dossier a été REFUSÉ : rouvre le dossier en DRAFT
 * (efface le motif/décision) pour qu'il repasse dans le pipeline d'admission.
 * Permet de réinscrire après un refus (ex. dossier incomplet désormais complété).
 */
export async function reenrollRefusedEnrollmentAction(enrollmentId: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const enr = await tx.enrollment.findUnique({ where: { id: enrollmentId }, select: { status: true } });
      if (!enr) throw new Error('Dossier introuvable.');
      if (enr.status !== 'REFUSE') throw new Error('Seul un dossier refusé peut être réinscrit.');
      await tx.enrollment.update({
        where: { id: enrollmentId },
        data: { status: 'DRAFT', refusalReason: null, decidedAt: null, decidedByUserId: null },
      });
      await logAudit(tx, { tenantId, userId: session.user.id, action: 'reenrollRefused', entityType: 'Enrollment', entityId: enrollmentId });
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
        const pay = await tx.payment.create({
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
        await postInstallmentPayment(tx, tenantId, inscription.id, { id: pay.id, amount: Number(inscription.amount), method }, new Date(), session.user.id);
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
