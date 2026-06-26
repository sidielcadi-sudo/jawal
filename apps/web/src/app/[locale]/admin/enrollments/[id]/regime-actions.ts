'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { feeCategoryApplies, buildInstallments, type FeeCategory } from '@/lib/fees';

type Result = { ok: true; message: string } | { ok: false; error: string };

const schema = z.object({
  enrollmentId: z.string().uuid(),
  regime: z.enum(['EXTERNE', 'DEMI_PENSIONNAIRE', 'INTERNE']).or(z.literal('')),
  usesTransport: z.boolean(),
  /** Nouveau nombre d'échéances par frais (re-répartition). */
  feeCounts: z
    .array(z.object({ feeId: z.string().uuid(), count: z.number().int().min(1).max(24) }))
    .optional(),
});

/** Catégories pilotées par le régime / transport (les seules recalculées). */
const VARIABLE_CATS: FeeCategory[] = ['TRANSPORT', 'CANTEEN'];

/**
 * Met à jour le régime / transport d'un élève DEPUIS l'inscription et recalcule
 * son échéancier pour les frais Transport & Cantine :
 *  - frais désormais applicable et absent → on génère ses échéances (PENDING) ;
 *  - frais retiré → on annule ses échéances IMPAYÉES, on CONSERVE celles déjà
 *    (partiellement) payées et on les signale (régularisation manuelle).
 */
export async function updateRegimeTransportAction(input: {
  enrollmentId: string;
  regime: string;
  usesTransport: boolean;
  feeCounts?: { feeId: string; count: number }[];
}): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('students.write');

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Données invalides.' };
  const regime = parsed.data.regime || null;
  const usesTransport = parsed.data.usesTransport;
  const ctx = { regime, usesTransport };
  const tenantId = session.user.tenantId;

  try {
    return await withTenant(tenantId, async (tx): Promise<Result> => {
      const enr = await tx.enrollment.findUnique({
        where: { id: parsed.data.enrollmentId },
        select: { id: true, studentId: true, academicYearId: true, levelId: true, feesGenerated: true },
      });
      if (!enr) return { ok: false, error: 'Inscription introuvable.' };

      // 1) Met à jour la fiche élève.
      await tx.person.update({
        where: { id: enr.studentId },
        data: { regime, usesTransport },
      });

      // 2) Si l'échéancier n'est pas encore généré, rien à recalculer (l'aperçu suit).
      if (!enr.feesGenerated) {
        await logAudit(tx, {
          tenantId,
          userId: session.user.id,
          action: 'update_regime_transport',
          entityType: 'Person',
          entityId: enr.studentId,
          after: { regime, usesTransport, feesRecomputed: false },
        });
        revalidatePath(`/admin/enrollments/${enr.id}`);
        return { ok: true, message: 'Régime / transport mis à jour (aucun échéancier à recalculer).' };
      }

      // 3) Recalcul ciblé Transport + Cantine.
      const catFees = await tx.feeScheduleItem.findMany({
        where: {
          academicYearId: enr.academicYearId,
          levelId: enr.levelId,
          kind: 'ANNUAL',
          category: { in: VARIABLE_CATS },
        },
      });
      const yearStart = (
        await tx.academicYear.findUniqueOrThrow({ where: { id: enr.academicYearId } })
      ).startDate;

      let added = 0;
      let cancelled = 0;
      let keptPaid = 0;

      for (const cat of VARIABLE_CATS) {
        const feesOfCat = catFees.filter((f) => f.category === cat);
        if (feesOfCat.length === 0) continue;
        const applies = feeCategoryApplies(cat, ctx);

        const existing = await tx.installment.findMany({
          where: {
            studentId: enr.studentId,
            feeScheduleItemId: { in: feesOfCat.map((f) => f.id) },
            status: { not: 'CANCELLED' },
          },
          include: { payments: { select: { amount: true } } },
        });

        if (applies) {
          // Génère les frais applicables qui n'ont pas encore d'échéances.
          for (const fee of feesOfCat) {
            if (existing.some((i) => i.feeScheduleItemId === fee.id)) continue;
            const drafts = buildInstallments(
              {
                id: fee.id,
                label: fee.label,
                category: fee.category as FeeCategory,
                totalAmount: Number(fee.totalAmount),
                installmentCount: fee.installmentCount,
                installmentLocked: fee.installmentLocked,
                firstDueMonth: fee.firstDueMonth,
              },
              { pct: 0, count: fee.installmentCount, yearStart },
            );
            for (const d of drafts) {
              await tx.installment.create({
                data: {
                  tenantId,
                  studentId: enr.studentId,
                  feeScheduleItemId: d.feeScheduleItemId,
                  label: d.label,
                  amount: d.amount,
                  dueDate: d.dueDate,
                  status: 'PENDING',
                },
              });
              added++;
            }
          }
        } else {
          // Frais retiré : annuler les impayées, conserver les (partiellement) payées.
          for (const inst of existing) {
            const paid = inst.payments.reduce((s, p) => s + Number(p.amount), 0);
            if (paid > 0) {
              keptPaid++;
              continue;
            }
            await tx.installment.update({ where: { id: inst.id }, data: { status: 'CANCELLED' } });
            cancelled++;
          }
        }
      }

      // 4) Re-répartition du nombre d'échéances par frais (ex. Scolarité).
      //    - frais verrouillé (paramétrage) ou déjà (partiellement) payé → ignoré ;
      //    - sinon : on supprime les échéances impayées et on régénère N échéances
      //      pour le MÊME montant remisé (la remise est préservée).
      let resplit = 0;
      let lockedFees = 0;
      for (const fc of parsed.data.feeCounts ?? []) {
        const fee = await tx.feeScheduleItem.findFirst({
          where: { id: fc.feeId, academicYearId: enr.academicYearId, levelId: enr.levelId, kind: 'ANNUAL' },
        });
        if (!fee || fee.installmentLocked) {
          if (fee?.installmentLocked) lockedFees++;
          continue;
        }
        const existing = await tx.installment.findMany({
          where: { studentId: enr.studentId, feeScheduleItemId: fee.id, status: { not: 'CANCELLED' } },
          include: { payments: { select: { amount: true } } },
        });
        if (existing.length === 0 || existing.length === fc.count) continue;
        const paidSum = existing.reduce(
          (s, i) => s + i.payments.reduce((x, y) => x + Number(y.amount), 0),
          0,
        );
        if (paidSum > 0) {
          lockedFees++;
          continue;
        }
        // Montant remisé existant = somme des échéances (préserve la remise).
        const discountedTotal = existing.reduce((s, i) => s + Number(i.amount), 0);
        const total = Number(fee.totalAmount);
        const pct = total > 0 ? (1 - discountedTotal / total) * 100 : 0;
        await tx.installment.deleteMany({ where: { id: { in: existing.map((i) => i.id) } } });
        const drafts = buildInstallments(
          {
            id: fee.id,
            label: fee.label,
            category: fee.category as FeeCategory,
            totalAmount: total,
            installmentCount: fee.installmentCount,
            installmentLocked: fee.installmentLocked,
            firstDueMonth: fee.firstDueMonth,
          },
          { pct, count: fc.count, yearStart },
        );
        for (const d of drafts) {
          await tx.installment.create({
            data: {
              tenantId,
              studentId: enr.studentId,
              feeScheduleItemId: d.feeScheduleItemId,
              label: d.label,
              amount: d.amount,
              dueDate: d.dueDate,
              status: 'PENDING',
            },
          });
        }
        resplit++;
      }

      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'update_regime_transport',
        entityType: 'Person',
        entityId: enr.studentId,
        after: { regime, usesTransport, added, cancelled, keptPaid, resplit, lockedFees },
      });
      revalidatePath(`/admin/enrollments/${enr.id}`);
      revalidatePath('/admin/finance');

      let message = 'Régime / transport mis à jour.';
      if (added) message += ` ${added} échéance(s) ajoutée(s).`;
      if (cancelled) message += ` ${cancelled} échéance(s) impayée(s) annulée(s).`;
      if (resplit) message += ` ${resplit} frais re-réparti(s).`;
      if (keptPaid)
        message += ` ⚠ ${keptPaid} échéance(s) déjà payée(s) conservée(s) — à régulariser (remboursement / avoir) manuellement.`;
      if (lockedFees)
        message += ` ⚠ ${lockedFees} frais non modifié(s) (déjà payé ou nombre d’échéances verrouillé en paramétrage).`;
      if (!added && !cancelled && !keptPaid && !resplit && !lockedFees)
        message += ' Aucun changement d’échéances.';
      return { ok: true, message };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
