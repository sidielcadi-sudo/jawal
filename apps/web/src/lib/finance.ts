import 'server-only';
import type { Prisma } from '@/lib/db';

/**
 * Calcule le statut d'une échéance à partir du total versé.
 */
export function computeInstallmentStatus(
  amount: number,
  paid: number,
): 'PENDING' | 'PARTIAL' | 'PAID' {
  if (paid <= 0) return 'PENDING';
  if (paid < amount) return 'PARTIAL';
  return 'PAID';
}

/**
 * Récupère le résumé financier d'un élève (échéances + paiements).
 * Retourne aussi les totaux dus, payés, restants.
 */
export async function computeStudentFinance(
  tx: Prisma.TransactionClient,
  studentId: string,
): Promise<{
  installments: Array<{
    id: string;
    label: string;
    amount: number;
    dueDate: Date;
    status: 'PENDING' | 'PARTIAL' | 'PAID' | 'CANCELLED';
    totalPaid: number;
    remaining: number;
    payments: Array<{
      id: string;
      amount: number;
      method: string;
      reference: string | null;
      paidAt: Date;
    }>;
  }>;
  totalDue: number;
  totalPaid: number;
  totalRemaining: number;
}> {
  const installments = await tx.installment.findMany({
    where: { studentId },
    include: { payments: { orderBy: { paidAt: 'desc' } } },
    orderBy: { dueDate: 'asc' },
  });

  let totalDue = 0;
  let totalPaid = 0;

  const rows = installments.map((inst) => {
    const amount = Number(inst.amount);
    const paid = inst.payments.reduce((s, p) => s + Number(p.amount), 0);
    if (inst.status !== 'CANCELLED') {
      totalDue += amount;
      totalPaid += paid;
    }
    return {
      id: inst.id,
      label: inst.label,
      amount,
      dueDate: inst.dueDate,
      status: inst.status as 'PENDING' | 'PARTIAL' | 'PAID' | 'CANCELLED',
      totalPaid: paid,
      remaining: Math.max(0, amount - paid),
      payments: inst.payments.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        method: p.method,
        reference: p.reference,
        paidAt: p.paidAt,
      })),
    };
  });

  return {
    installments: rows,
    totalDue,
    totalPaid,
    totalRemaining: Math.max(0, totalDue - totalPaid),
  };
}
