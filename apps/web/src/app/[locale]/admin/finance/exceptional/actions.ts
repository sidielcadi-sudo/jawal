'use server';

import { revalidatePath } from 'next/cache';
import {
  exceptionalFeeTypeSchema,
  exceptionalFeeCreateSchema,
} from '@jawal/shared';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { computeInstallmentStatus } from '@/lib/finance';
import { putObject } from '@/lib/storage';
import { assignStudents, studentsOfClasses, billFeeAssignments } from '@/lib/exceptional-fees';
import { notifyExceptionalFeePublished } from '@/lib/exceptional-fee-notify';

const REFUND_MIME = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);

type Result = { ok: true } | { ok: false; error: string };

/* ----------------------------- Types catalog ---------------------------- */

export async function createFeeTypeAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('finance.write');
  const parsed = exceptionalFeeTypeSchema.safeParse({
    labelFr: formData.get('labelFr'),
    labelAr: formData.get('labelAr'),
    order: formData.get('order') ?? 0,
    active: formData.get('active') === 'on' || formData.get('active') === 'true',
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };
  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const r = await tx.exceptionalFeeType.create({ data: { tenantId, ...parsed.data } });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'create',
        entityType: 'ExceptionalFeeType',
        entityId: r.id,
        after: parsed.data,
      });
    });
  } catch {
    return { ok: false, error: 'Ce type existe déjà.' };
  }
  revalidatePath('/admin/finance/exceptional');
  return { ok: true };
}

export async function updateFeeTypeAction(id: string, formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('finance.write');
  const parsed = exceptionalFeeTypeSchema.safeParse({
    labelFr: formData.get('labelFr'),
    labelAr: formData.get('labelAr'),
    order: formData.get('order') ?? 0,
    active: formData.get('active') === 'on' || formData.get('active') === 'true',
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };
  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    await tx.exceptionalFeeType.update({ where: { id }, data: parsed.data });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'update',
      entityType: 'ExceptionalFeeType',
      entityId: id,
      after: parsed.data,
    });
  });
  revalidatePath('/admin/finance/exceptional');
  return { ok: true };
}

export async function deleteFeeTypeAction(id: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('finance.write');
  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      await tx.exceptionalFeeType.delete({ where: { id } });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'delete',
        entityType: 'ExceptionalFeeType',
        entityId: id,
      });
    });
  } catch {
    return { ok: false, error: 'Type utilisé par un frais — désactivez-le plutôt.' };
  }
  revalidatePath('/admin/finance/exceptional');
  return { ok: true };
}

/* ------------------------------ Fees CRUD ------------------------------- */

export async function createFeeAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('finance.write');
  const parsed = exceptionalFeeCreateSchema.safeParse({
    academicYearId: formData.get('academicYearId'),
    typeId: formData.get('typeId'),
    label: formData.get('label'),
    description: formData.get('description'),
    amount: formData.get('amount'),
    activityDate: formData.get('activityDate'),
    dueDate: formData.get('dueDate'),
    mandatory: formData.get('mandatory') === 'on' || formData.get('mandatory') === 'true',
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  // Ciblage saisi dès la création (spec §2 : classe(s) concernée(s) + élèves).
  const classIds = formData.getAll('classIds').map(String).filter(Boolean);
  const studentIds = formData.getAll('studentIds').map(String).filter(Boolean);
  if (classIds.length === 0 && studentIds.length === 0) {
    return { ok: false, error: 'Sélectionnez au moins une classe ou un élève concerné.' };
  }

  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const fee = await tx.exceptionalFee.create({
        data: {
          tenantId,
          academicYearId: parsed.data.academicYearId,
          typeId: parsed.data.typeId ?? null,
          label: parsed.data.label,
          description: parsed.data.description ?? null,
          amount: parsed.data.amount,
          activityDate: parsed.data.activityDate ?? null,
          dueDate: parsed.data.dueDate ?? null,
          mandatory: parsed.data.mandatory,
          // Statut DRAFT : créé mais PAS encore facturé ni notifié.
          status: 'DRAFT',
          createdByUserId: session.user.id,
        },
      });
      // Affectation aux élèves ciblés (sans facturation à ce stade).
      const fromClasses = await studentsOfClasses(tx, classIds);
      const created = await assignStudents(tx, tenantId, fee, [...fromClasses, ...studentIds]);
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'create',
        entityType: 'ExceptionalFee',
        entityId: fee.id,
        after: {
          label: parsed.data.label,
          amount: parsed.data.amount,
          mandatory: parsed.data.mandatory,
          assigned: created,
        },
      });
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur création' };
  }
  revalidatePath('/admin/finance/exceptional');
  return { ok: true };
}

export async function deleteFeeAction(id: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('finance.write');
  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      // Suppression réservée aux brouillons. Un frais publié ne se supprime pas
      // (il se clôture). Garantit qu'aucun frais facturé/notifié n'est effacé.
      const fee = await tx.exceptionalFee.findUnique({ where: { id }, select: { status: true } });
      if (!fee) throw new Error('introuvable');
      if (fee.status !== 'DRAFT') throw new Error('notdraft');
      await tx.exceptionalFee.delete({ where: { id } });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'delete',
        entityType: 'ExceptionalFee',
        entityId: id,
      });
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error && e.message === 'notdraft'
        ? 'Un frais publié ne peut pas être supprimé — clôturez-le.'
        : 'Erreur suppression.',
    };
  }
  revalidatePath('/admin/finance/exceptional');
  return { ok: true };
}

/**
 * Publie un frais : notifie les parents (les frais optionnels apparaissent côté
 * parent pour acceptation). Pour un frais OBLIGATOIRE, facture immédiatement
 * toutes les affectations (passage en « À payer »).
 */
export async function publishFeeAction(id: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('finance.write');
  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const fee = await tx.exceptionalFee.findUnique({ where: { id } });
      if (!fee) throw new Error('Frais introuvable');
      const count = await tx.exceptionalFeeAssignment.count({ where: { exceptionalFeeId: id } });
      if (count === 0) throw new Error('Aucun élève concerné — ajoutez une classe ou un élève.');
      await tx.exceptionalFee.update({ where: { id }, data: { status: 'PUBLISHED' } });
      if (fee.mandatory) await billFeeAssignments(tx, tenantId, fee);
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'publish',
        entityType: 'ExceptionalFee',
        entityId: id,
        after: { mandatory: fee.mandatory, assigned: count },
      });
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur publication' };
  }
  // Après la transaction : un envoi qui échoue ne doit pas annuler une
  // publication déjà enregistrée.
  await notifyExceptionalFeePublished(tenantId, id);
  revalidatePath('/admin/finance/exceptional');
  revalidatePath(`/admin/finance/exceptional/${id}`);
  return { ok: true };
}

/**
 * Annule la participation d'un élève à un frais exceptionnel (après paiement).
 * - mode CREDIT : impute le montant versé sur une autre échéance (recalculée).
 * - mode REFUND : remboursement effectué (sortie de caisse) + justificatif.
 * L'échéance du frais exceptionnel passe en ANNULÉE (sort des totaux).
 */
export async function cancelAssignmentAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('finance.write');
  const tenantId = session.user.tenantId;

  const assignmentId = String(formData.get('assignmentId') ?? '');
  const mode = String(formData.get('mode') ?? ''); // 'REFUND' | 'CREDIT'
  const targetInstallmentId = String(formData.get('targetInstallmentId') ?? '');
  if (!assignmentId) return { ok: false, error: 'Affectation manquante.' };

  // 1) Validation + lecture (transaction courte, sans I/O réseau).
  let ctx: { studentId: string; installmentId: string; paid: number; label: string } | null = null;
  try {
    ctx = await withTenant(tenantId, async (tx) => {
      const a = await tx.exceptionalFeeAssignment.findUnique({
        where: { id: assignmentId },
        include: {
          installment: { include: { payments: { select: { amount: true } } } },
          exceptionalFee: { select: { label: true } },
        },
      });
      if (!a) throw new Error('Affectation introuvable.');
      if (!a.installment) throw new Error('Rien à annuler — frais non facturé.');
      if (a.installment.status === 'CANCELLED') throw new Error('Déjà annulé.');
      const paid = a.installment.payments.reduce((s, p) => s + Number(p.amount), 0);
      if (paid > 0 && mode !== 'REFUND' && mode !== 'CREDIT') {
        throw new Error('Choisissez le remboursement ou l’imputation.');
      }
      if (paid > 0 && mode === 'CREDIT') {
        const target = await tx.installment.findUnique({
          where: { id: targetInstallmentId },
          select: { id: true, studentId: true, status: true },
        });
        if (!target || target.studentId !== a.studentId || target.id === a.installment.id) {
          throw new Error('Échéance cible invalide.');
        }
        if (target.status === 'CANCELLED') throw new Error('Échéance cible annulée.');
      }
      return { studentId: a.studentId, installmentId: a.installment.id, paid, label: a.exceptionalFee.label };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }

  // 2) Justificatif de remboursement (hors transaction — I/O S3).
  let refundS3Key: string | undefined;
  let refundMeta: { filename: string; mime: string; size: number } | undefined;
  if (ctx.paid > 0 && mode === 'REFUND') {
    const file = formData.get('file');
    if (file && typeof file !== 'string' && file.size > 0) {
      if (file.size > 5 * 1024 * 1024) return { ok: false, error: 'Justificatif trop volumineux (max 5 Mo).' };
      if (!REFUND_MIME.has(file.type)) return { ok: false, error: 'Format non supporté (PDF ou image).' };
      const put = await putObject({
        buffer: Buffer.from(await file.arrayBuffer()),
        filename: file.name || 'justificatif',
        mime: file.type,
        tenantId,
        ownerType: 'fee.refund',
        ownerId: assignmentId,
      });
      refundS3Key = put.s3Key;
      refundMeta = { filename: put.filename, mime: put.mime, size: put.sizeBytes };
    }
  }

  // 3) Écriture (transaction courte).
  try {
    await withTenant(tenantId, async (tx) => {
      let creditInstallmentId: string | null = null;

      if (ctx!.paid > 0 && mode === 'CREDIT') {
        const target = await tx.installment.findUnique({
          where: { id: targetInstallmentId },
          include: { payments: { select: { amount: true } } },
        });
        if (!target) throw new Error('Échéance cible introuvable.');
        const targetPaid = target.payments.reduce((s, p) => s + Number(p.amount), 0);
        const remaining = Math.max(0, Number(target.amount) - targetPaid);
        const credit = Math.min(ctx!.paid, remaining);
        if (credit > 0) {
          await tx.payment.create({
            data: {
              tenantId,
              installmentId: target.id,
              amount: credit,
              method: 'OTHER',
              reference: `Avoir – ${ctx!.label}`,
              recordedByUserId: session.user.id,
            },
          });
          await tx.installment.update({
            where: { id: target.id },
            data: { status: computeInstallmentStatus(Number(target.amount), targetPaid + credit) },
          });
        }
        creditInstallmentId = target.id;
      }

      let refundFileId: string | null = null;
      if (refundS3Key && refundMeta) {
        const f = await tx.fileObject.create({
          data: {
            tenantId,
            ownerType: 'fee.refund',
            ownerId: assignmentId,
            s3Key: refundS3Key,
            filename: refundMeta.filename,
            mime: refundMeta.mime,
            sizeBytes: refundMeta.size,
          },
        });
        refundFileId = f.id;
      }

      // L'échéance du frais exceptionnel est annulée (sort des totaux).
      await tx.installment.update({ where: { id: ctx!.installmentId }, data: { status: 'CANCELLED' } });

      await tx.exceptionalFeeAssignment.update({
        where: { id: assignmentId },
        data: {
          refundMode: ctx!.paid > 0 ? (mode === 'CREDIT' ? 'CREDITED' : 'REFUNDED') : null,
          refundedAt: ctx!.paid > 0 ? new Date() : null,
          refundFileId,
          creditInstallmentId,
        },
      });

      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'cancel',
        entityType: 'ExceptionalFeeAssignment',
        entityId: assignmentId,
        after: { mode: ctx!.paid > 0 ? mode : 'NONE', paid: ctx!.paid, creditInstallmentId },
      });
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur annulation' };
  }

  revalidatePath('/admin/finance/exceptional');
  return { ok: true };
}

export async function closeFeeAction(id: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('finance.write');
  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    await tx.exceptionalFee.update({ where: { id }, data: { status: 'CLOSED' } });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'close',
      entityType: 'ExceptionalFee',
      entityId: id,
    });
  });
  revalidatePath('/admin/finance/exceptional');
  revalidatePath(`/admin/finance/exceptional/${id}`);
  return { ok: true };
}
