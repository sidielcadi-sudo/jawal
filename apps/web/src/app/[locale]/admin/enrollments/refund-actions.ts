'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { requireRoleCode } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { alertRole } from '@/lib/staff-alerts';
import { postStudentRefund } from '@/lib/accounting-hooks';
import { computeRefund, loadRefundItems, refundableMap, type RefundBasis } from '@/lib/refund';
import type { Prisma } from '@jawal/db';

type Result = { ok: true } | { ok: false; error: string };

const ROLE_COMPTA = ['comptable', 'tenant_admin'];
const ROLE_DIRECTION = ['direction', 'tenant_admin'];
const METHODS = ['VIREMENT', 'CHEQUE', 'ESPECES'] as const;
const L = (locale: string, fr: string, ar: string) => (locale === 'ar' ? ar : fr);

function revalidate(enrollmentId: string) {
  revalidatePath(`/admin/enrollments/${enrollmentId}`);
}

async function loadContext(tx: Prisma.TransactionClient, radiationId: string) {
  const rr = await tx.radiationRequest.findUnique({
    where: { id: radiationId },
    select: {
      studentId: true,
      enrollmentId: true,
      student: { select: { firstName: true, lastName: true } },
      enrollment: { select: { academicYearId: true, academicYear: { select: { startDate: true, endDate: true } } } },
    },
  });
  const refund = await tx.radiationRefund.findUnique({ where: { radiationRequestId: radiationId } });
  return { rr, refund };
}

/**
 * Comptabilité : calcule le remboursable selon la base choisie et soumet à la
 * direction. `manualAmount` (facultatif) force un montant saisi à la main
 * lorsque le calcul automatique ne convient pas.
 */
export async function computeRefundAction(
  radiationId: string,
  basis: string,
  manualAmount?: number | null,
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requireRoleCode(ROLE_COMPTA);
  const b: RefundBasis = basis === 'PRORATA' ? 'PRORATA' : 'INSTALLMENT';
  const tenantId = session.user.tenantId;
  try {
    let enrollmentId = '';
    await withTenant(tenantId, async (tx) => {
      const { rr, refund } = await loadContext(tx, radiationId);
      if (!rr || !refund) throw new Error('Remboursement introuvable.');
      if (refund.status === 'PAID') throw new Error('Remboursement déjà payé.');
      enrollmentId = rr.enrollmentId;
      const tenant = await tx.tenant.findFirst({ select: { settings: true, localeDefault: true } });
      const items = await loadRefundItems(tx, rr.studentId, rr.enrollment.academicYearId);
      const comp = computeRefund(items, {
        basis: b,
        refundable: refundableMap(tenant?.settings),
        now: new Date(),
        yearStart: rr.enrollment.academicYear.startDate,
        yearEnd: rr.enrollment.academicYear.endDate,
      });
      // Montant saisi manuellement prioritaire (borné ≥ 0) ; sinon calcul auto.
      const manual = manualAmount != null && manualAmount >= 0 ? Math.round(manualAmount * 100) / 100 : null;
      const finalAmount = manual ?? comp.computedAmount;
      await tx.radiationRefund.update({
        where: { id: refund.id },
        data: {
          basis: b,
          paidTotal: comp.paidTotal,
          consumedTotal: Math.round((comp.paidTotal - finalAmount) * 100) / 100,
          computedAmount: finalAmount,
          // Montant manuel : pas de ventilation par catégorie (décision libre) →
          // on n'affiche pas un détail auto qui contredirait le total saisi.
          breakdown: manual != null ? [] : comp.lines,
          status: 'CALCULATED',
          comptaByUserId: session.user.id,
          approvedAmount: null,
        },
      });
      await logAudit(tx, { tenantId, userId: session.user.id, action: 'refund_computed', entityType: 'RadiationRefund', entityId: refund.id, after: { basis: b, computedAmount: finalAmount, manual: manual != null } });
      const loc = tenant?.localeDefault ?? 'fr';
      const name = `${rr.student.lastName} ${rr.student.firstName}`;
      await alertRole(tx, tenantId, ROLE_DIRECTION, {
        type: 'REFUND_CHECK',
        title: L(loc, 'Remboursement à valider', 'استرجاع للمصادقة'),
        body: L(loc, `${name} — montant proposé ${finalAmount}.`, `${name} — المبلغ المقترح ${finalAmount}.`),
        link: `enrollments/${rr.enrollmentId}`,
        relatedType: 'RadiationRefund',
        relatedId: refund.id,
      });
    });
    revalidate(enrollmentId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/** Direction : approuve le montant proposé ou le corrige. */
export async function approveRefundAction(radiationId: string, approvedAmount?: number | null, comment?: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requireRoleCode(ROLE_DIRECTION);
  const tenantId = session.user.tenantId;
  try {
    let enrollmentId = '';
    await withTenant(tenantId, async (tx) => {
      const { rr, refund } = await loadContext(tx, radiationId);
      if (!rr || !refund) throw new Error('Remboursement introuvable.');
      if (refund.status !== 'CALCULATED') throw new Error('Étape invalide.');
      enrollmentId = rr.enrollmentId;
      const amount = approvedAmount != null && approvedAmount >= 0 ? approvedAmount : Number(refund.computedAmount);
      await tx.radiationRefund.update({
        where: { id: refund.id },
        data: { status: 'APPROVED', approvedAmount: amount, directionByUserId: session.user.id, directionComment: comment?.trim() || null, approvedAt: new Date() },
      });
      await logAudit(tx, { tenantId, userId: session.user.id, action: 'refund_approved', entityType: 'RadiationRefund', entityId: refund.id, after: { approvedAmount: amount } });
      const tenant = await tx.tenant.findFirst({ select: { localeDefault: true } });
      const loc = tenant?.localeDefault ?? 'fr';
      const name = `${rr.student.lastName} ${rr.student.firstName}`;
      await alertRole(tx, tenantId, ROLE_COMPTA, {
        type: 'REFUND_CHECK',
        title: L(loc, 'Remboursement approuvé', 'تمت المصادقة على الاسترجاع'),
        body: L(loc, `${name} — procéder au paiement (${amount}).`, `${name} — الشروع في الأداء (${amount}).`),
        link: `enrollments/${rr.enrollmentId}`,
        relatedType: 'RadiationRefund',
        relatedId: refund.id,
      });
    });
    revalidate(enrollmentId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/** Aucun remboursement dû (compta ou direction). */
export async function rejectRefundAction(radiationId: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requireRoleCode([...ROLE_COMPTA, ...ROLE_DIRECTION]);
  const tenantId = session.user.tenantId;
  try {
    let enrollmentId = '';
    await withTenant(tenantId, async (tx) => {
      const { rr, refund } = await loadContext(tx, radiationId);
      if (!rr || !refund) throw new Error('Remboursement introuvable.');
      if (refund.status === 'PAID') throw new Error('Remboursement déjà payé.');
      enrollmentId = rr.enrollmentId;
      await tx.radiationRefund.update({ where: { id: refund.id }, data: { status: 'REJECTED' } });
      await logAudit(tx, { tenantId, userId: session.user.id, action: 'refund_rejected', entityType: 'RadiationRefund', entityId: refund.id });
    });
    revalidate(enrollmentId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/** Comptabilité : enregistre le paiement + écriture comptable + reçu disponible. */
export async function payRefundAction(radiationId: string, method: string, reference?: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requireRoleCode(ROLE_COMPTA);
  const m = (METHODS.includes(method as (typeof METHODS)[number]) ? method : 'VIREMENT') as (typeof METHODS)[number];
  const tenantId = session.user.tenantId;
  try {
    let enrollmentId = '';
    await withTenant(tenantId, async (tx) => {
      const { rr, refund } = await loadContext(tx, radiationId);
      if (!rr || !refund) throw new Error('Remboursement introuvable.');
      if (refund.status !== 'APPROVED') throw new Error('Le remboursement doit être approuvé par la direction.');
      enrollmentId = rr.enrollmentId;
      const now = new Date();
      const amount = refund.approvedAmount != null ? Number(refund.approvedAmount) : Number(refund.computedAmount);
      await tx.radiationRefund.update({
        where: { id: refund.id },
        data: { status: 'PAID', method: m, reference: reference?.trim() || null, paidByUserId: session.user.id, paidAt: now },
      });
      await postStudentRefund(tx, tenantId, refund.id, amount, m, now, session.user.id);
      await logAudit(tx, { tenantId, userId: session.user.id, action: 'refund_paid', entityType: 'RadiationRefund', entityId: refund.id, after: { amount, method: m } });
    });
    revalidate(enrollmentId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
