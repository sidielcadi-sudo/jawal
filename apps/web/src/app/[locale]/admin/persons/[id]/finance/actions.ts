'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { generateInstallmentsSchema, recordPaymentSchema } from '@jawal/shared';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { postInstallmentPayment, postDebtWaiver } from '@/lib/accounting-hooks';
import { computeInstallmentStatus } from '@/lib/finance';
import {
  activeSchoolYear,
  isPreviousYearDue,
  isWaiveOpenForDueDate,
  loadDebtWaiverPolicy,
  waiverWindowStart,
} from '@/lib/school-year';

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

export type WaiveOutcome = {
  /** Échéances effectivement effacées. */
  waived: number;
  /** Total du reliquat abandonné. */
  total: number;
  /** Lignes écartées, avec le motif — l'écran doit pouvoir le dire. */
  skipped: { label: string; reason: string }[];
};

/**
 * Efface une ou plusieurs créances (remise gracieuse) : le reliquat impayé de
 * chaque échéance est annulé — l'échéance passe en CANCELLED mais reste
 * **tracée** (montant, motif, auteur, date) et une écriture OD est passée
 * (Débit 7119 remise / Crédit 34211).
 *
 * Le lot est **atomique** : une seule transaction, donc soit toutes les
 * écritures comptables passent, soit aucune. En revanche une ligne inéligible
 * (déjà soldée, déjà effacée, hors fenêtre) n'annule pas le lot : elle est
 * écartée et remontée dans `skipped`. Refuser 40 effacements parce que le 12ᵉ
 * a été réglé entre-temps serait une punition, pas une garantie.
 */
export async function waiveInstallmentDebtsAction(
  installmentIds: string[],
  reason: string,
): Promise<Result<WaiveOutcome>> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('finance.write');
  const motif = reason?.trim();
  if (!motif) return { ok: false, error: 'Motif requis.' };
  const ids = [...new Set(installmentIds)].filter(Boolean);
  if (ids.length === 0) return { ok: false, error: 'Aucune créance sélectionnée.' };
  const tenantId = session.user.tenantId;

  let studentIds: string[] = [];
  let outcome: WaiveOutcome;
  try {
    const res = await withTenant(tenantId, async (tx) => {
      // Garde-fou serveur : l'effacement suit la politique de l'établissement
      // (Paramétrage → Frais). Masquer la case ne suffit pas — l'action est
      // appelable directement et le geste est irréversible.
      const [year, policy] = await Promise.all([activeSchoolYear(tx), loadDebtWaiverPolicy(tx)]);
      const opensAt = waiverWindowStart(year, policy);
      const closedMsg =
        opensAt && year
          ? `créance de l'année en cours — effacement ouvert le ${opensAt.toLocaleDateString('fr-FR')} (fin de l'année ${year.label})`
          : "aucune année scolaire active : effacement indisponible";

      const rows = await tx.installment.findMany({
        where: { id: { in: ids } },
        include: { payments: true },
      });
      const found = new Set(rows.map((r) => r.id));

      const skipped: { label: string; reason: string }[] = [];
      for (const id of ids) {
        if (!found.has(id)) skipped.push({ label: id, reason: 'échéance introuvable' });
      }

      const now = new Date();
      const students = new Set<string>();
      let waived = 0;
      let total = 0;

      for (const inst of rows) {
        if (inst.status === 'CANCELLED') {
          skipped.push({ label: inst.label, reason: 'déjà effacée' });
          continue;
        }
        // La fenêtre de fin d'année ne protège que l'exercice en cours ; les
        // créances antérieures restent effaçables à tout moment.
        if (!isWaiveOpenForDueDate(year, policy, inst.dueDate, now)) {
          skipped.push({ label: inst.label, reason: closedMsg });
          continue;
        }
        const paid = inst.payments.reduce((s2, p2) => s2 + Number(p2.amount), 0);
        const remaining = Math.round((Number(inst.amount) - paid) * 100) / 100;
        if (remaining <= 0) {
          skipped.push({ label: inst.label, reason: 'soldée, aucun reliquat' });
          continue;
        }

        await tx.installment.update({
          where: { id: inst.id },
          data: {
            status: 'CANCELLED',
            waivedAmount: remaining,
            waivedReason: motif,
            waivedByUserId: session.user.id,
            waivedAt: now,
          },
        });
        await postDebtWaiver(
          tx,
          tenantId,
          { id: inst.id, label: inst.label },
          remaining,
          now,
          session.user.id,
        );
        await logAudit(tx, {
          tenantId,
          userId: session.user.id,
          action: 'waive_debt',
          entityType: 'Installment',
          entityId: inst.id,
          after: {
            amount: remaining,
            reason: motif,
            previousYear: isPreviousYearDue(year, inst.dueDate),
          },
        });
        students.add(inst.studentId);
        waived += 1;
        total = Math.round((total + remaining) * 100) / 100;
      }

      return { students: [...students], outcome: { waived, total, skipped } };
    });
    studentIds = res.students;
    outcome = res.outcome;
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }

  // Rien d'effacé : c'est un échec du point de vue de l'utilisateur, même si
  // la transaction s'est bien passée. On lui rend le premier motif.
  if (outcome.waived === 0) {
    return {
      ok: false,
      error: outcome.skipped[0]
        ? `Aucune créance effacée — ${outcome.skipped[0].reason}.`
        : 'Aucune créance effacée.',
    };
  }

  for (const id of studentIds) revalidatePath(`/admin/persons/${id}/finance`);
  revalidatePath('/admin/finance');
  revalidatePath('/admin/finance/unpaid');
  revalidatePath('/admin/enrollments/bulk-reenroll');
  return { ok: true, data: outcome };
}

/** Effacement d'une seule créance — le cas courant, depuis la fiche élève. */
export async function waiveInstallmentDebtAction(
  installmentId: string,
  reason: string,
): Promise<Result> {
  const r = await waiveInstallmentDebtsAction([installmentId], reason);
  return r.ok ? { ok: true } : r;
}

/**
 * Génère un échéancier mensuel pour un élève à partir d'une grille tarifaire.
 * Crée installmentCount lignes Installment, équiréparties, à partir du
 * firstDueMonth (mois 1-12).
 */
export async function generateInstallmentsAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('finance.write');

  const parsed = generateInstallmentsSchema.safeParse({
    studentId: formData.get('studentId'),
    feeScheduleItemId: formData.get('feeScheduleItemId'),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  const tenantId = session.user.tenantId;

  try {
    await withTenant(tenantId, async (tx) => {
      const schedule = await tx.feeScheduleItem.findUnique({
        where: { id: parsed.data.feeScheduleItemId },
        include: { academicYear: true },
      });
      if (!schedule) throw new Error('Grille tarifaire introuvable');

      const total = Number(schedule.totalAmount);
      const count = schedule.installmentCount;
      const perInst = Math.round((total / count) * 100) / 100;
      const yearStart = new Date(schedule.academicYear.startDate);
      const year = yearStart.getUTCFullYear();

      // Générer N lignes mensuelles
      const data: Array<{
        tenantId: string;
        studentId: string;
        feeScheduleItemId: string;
        label: string;
        amount: number;
        dueDate: Date;
      }> = [];
      for (let i = 0; i < count; i++) {
        const monthIdx = ((schedule.firstDueMonth - 1 + i) % 12) + 1;
        const yearOffset = Math.floor((schedule.firstDueMonth - 1 + i) / 12);
        const dueDate = new Date(Date.UTC(year + yearOffset, monthIdx - 1, 5)); // 5 du mois
        // Dernière échéance prend le reliquat pour éviter les arrondis qui ne tombent pas juste
        const amount = i === count - 1 ? total - perInst * (count - 1) : perInst;
        data.push({
          tenantId,
          studentId: parsed.data.studentId,
          feeScheduleItemId: schedule.id,
          label: `${schedule.label} — ${monthIdx.toString().padStart(2, '0')}/${year + yearOffset}`,
          amount: Math.round(amount * 100) / 100,
          dueDate,
        });
      }
      await tx.installment.createMany({ data });

      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'generate',
        entityType: 'Installments',
        entityId: parsed.data.studentId,
        after: { count, total, schedule: schedule.label },
      });
    });
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur génération' };
  }

  revalidatePath(`/admin/persons/${parsed.data.studentId}/finance`);
  return { ok: true };
}

export async function recordPaymentAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('payments.record');

  const parsed = recordPaymentSchema.safeParse({
    installmentId: formData.get('installmentId'),
    amount: formData.get('amount'),
    method: formData.get('method'),
    reference: formData.get('reference'),
    paidAt: formData.get('paidAt'),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  const tenantId = session.user.tenantId;
  let studentId: string | null = null;
  try {
    studentId = await withTenant(tenantId, async (tx) => {
      const inst = await tx.installment.findUnique({
        where: { id: parsed.data.installmentId },
        include: { payments: true },
      });
      if (!inst) throw new Error('Échéance introuvable');

      const currentlyPaid = inst.payments.reduce((s, p) => s + Number(p.amount), 0);
      const newPaid = currentlyPaid + parsed.data.amount;
      const amount = Number(inst.amount);
      if (newPaid > amount + 0.01) {
        throw new Error(`Le total versé (${newPaid}) dépasse l'échéance (${amount}).`);
      }

      const pay = await tx.payment.create({
        data: {
          tenantId,
          installmentId: inst.id,
          amount: parsed.data.amount,
          method: parsed.data.method,
          reference: parsed.data.reference ?? null,
          paidAt: parsed.data.paidAt,
          recordedByUserId: session.user.id,
        },
      });
      await postInstallmentPayment(tx, tenantId, inst.id, { id: pay.id, amount: parsed.data.amount, method: parsed.data.method }, parsed.data.paidAt ?? new Date(), session.user.id);

      const newStatus = computeInstallmentStatus(amount, newPaid);
      await tx.installment.update({
        where: { id: inst.id },
        data: { status: newStatus },
      });

      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'record',
        entityType: 'Payment',
        entityId: inst.id,
        after: { amount: parsed.data.amount, method: parsed.data.method, status: newStatus },
      });

      return inst.studentId;
    });
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur paiement' };
  }

  if (studentId) {
    revalidatePath(`/admin/persons/${studentId}/finance`);
  }
  revalidatePath('/admin/finance');
  return { ok: true };
}
