import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { csvResponse, toCSV } from '@/lib/csv-export';

export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const rows = await withTenant(session.user.tenantId, async (tx) => {
    const installments = await tx.installment.findMany({
      where: { status: { not: 'CANCELLED' } },
      include: {
        student: { select: { firstName: true, lastName: true } },
        payments: { select: { amount: true, method: true, paidAt: true } },
      },
      orderBy: [{ studentId: 'asc' }, { dueDate: 'asc' }],
    });

    return installments.map((i) => {
      const totalPaid = i.payments.reduce((s, p) => s + Number(p.amount), 0);
      const amount = Number(i.amount);
      return {
        lastName: i.student.lastName,
        firstName: i.student.firstName,
        label: i.label,
        dueDate: i.dueDate.toISOString().slice(0, 10),
        amount: amount.toFixed(2),
        paid: totalPaid.toFixed(2),
        remaining: Math.max(0, amount - totalPaid).toFixed(2),
        status: i.status,
        paymentCount: i.payments.length,
        lastPaymentAt: i.payments[0]?.paidAt.toISOString().slice(0, 10) ?? '',
      };
    });
  });

  const csv = toCSV(rows, [
    { key: 'lastName', label: 'Nom' },
    { key: 'firstName', label: 'Prénom' },
    { key: 'label', label: 'Échéance' },
    { key: 'dueDate', label: 'Date échéance' },
    { key: 'amount', label: 'Montant' },
    { key: 'paid', label: 'Payé' },
    { key: 'remaining', label: 'Reste dû' },
    { key: 'status', label: 'Statut' },
    { key: 'paymentCount', label: 'Nb paiements' },
    { key: 'lastPaymentAt', label: 'Dernier paiement' },
  ]);

  return csvResponse(csv, `finance-${new Date().toISOString().slice(0, 10)}.csv`);
}
