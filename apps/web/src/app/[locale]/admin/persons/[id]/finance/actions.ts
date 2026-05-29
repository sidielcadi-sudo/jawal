'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { generateInstallmentsSchema, recordPaymentSchema } from '@jawal/shared';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { computeInstallmentStatus } from '@/lib/finance';

type Result = { ok: true } | { ok: false; error: string };

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

      await tx.payment.create({
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
