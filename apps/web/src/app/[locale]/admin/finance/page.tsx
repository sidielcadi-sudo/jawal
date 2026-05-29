import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';

export default async function FinanceDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.finance');

  const session = (await auth())!;
  const tenantId = session.user.tenantId;

  const data = await withTenant(tenantId, async (tx) => {
    const tenant = await tx.tenant.findFirst();

    // Sommes globales en JS (Decimal Prisma → Number via aggregate)
    const allInstallments = await tx.installment.findMany({
      where: { status: { not: 'CANCELLED' } },
      select: { id: true, amount: true, status: true, studentId: true },
    });
    const allPayments = await tx.payment.findMany({
      select: { amount: true, paidAt: true, installmentId: true },
    });

    let totalDue = 0;
    let totalPaid = 0;
    const paidByInst = new Map<string, number>();
    for (const p of allPayments) {
      paidByInst.set(p.installmentId, (paidByInst.get(p.installmentId) ?? 0) + Number(p.amount));
    }
    for (const i of allInstallments) {
      totalDue += Number(i.amount);
      totalPaid += paidByInst.get(i.id) ?? 0;
    }
    const collectionRate = totalDue > 0 ? (totalPaid / totalDue) * 100 : 0;

    // Top 10 élèves en retard de paiement (totalRemaining décroissant)
    const remainingByStudent = new Map<string, number>();
    for (const i of allInstallments) {
      const paid = paidByInst.get(i.id) ?? 0;
      const rem = Math.max(0, Number(i.amount) - paid);
      if (rem > 0) {
        remainingByStudent.set(i.studentId, (remainingByStudent.get(i.studentId) ?? 0) + rem);
      }
    }
    const topUnpaidIds = Array.from(remainingByStudent.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id]) => id);
    const topUnpaid = topUnpaidIds.length
      ? await tx.person.findMany({
          where: { id: { in: topUnpaidIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];

    // Encaissements des 30 derniers jours
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recent = allPayments.filter((p) => p.paidAt >= since);
    const recentTotal = recent.reduce((s, p) => s + Number(p.amount), 0);

    return {
      currency: tenant?.currency ?? 'MAD',
      totalDue,
      totalPaid,
      totalRemaining: Math.max(0, totalDue - totalPaid),
      collectionRate,
      installmentsCount: allInstallments.length,
      paidCount: allInstallments.filter((i) => i.status === 'PAID').length,
      pendingCount: allInstallments.filter((i) => i.status === 'PENDING').length,
      partialCount: allInstallments.filter((i) => i.status === 'PARTIAL').length,
      topUnpaid: topUnpaid.map((p) => ({
        ...p,
        remaining: remainingByStudent.get(p.id) ?? 0,
      })),
      recentTotal,
      recentCount: recent.length,
    };
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t('kpi.totalDue')} value={`${formatNumber(data.totalDue)} ${data.currency}`} />
        <Kpi
          label={t('kpi.totalPaid')}
          value={`${formatNumber(data.totalPaid)} ${data.currency}`}
          color="emerald"
        />
        <Kpi
          label={t('kpi.totalRemaining')}
          value={`${formatNumber(data.totalRemaining)} ${data.currency}`}
          color={data.totalRemaining > 0 ? 'red' : 'emerald'}
        />
        <Kpi
          label={t('kpi.collectionRate')}
          value={`${data.collectionRate.toFixed(1)}%`}
          color={data.collectionRate >= 80 ? 'emerald' : data.collectionRate >= 50 ? 'amber' : 'red'}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <h2 className="mb-3 text-base font-semibold text-slate-900">{t('topUnpaid')}</h2>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-start">{t('table.student')}</th>
                  <th className="px-4 py-3 text-end">{t('table.remaining')}</th>
                  <th className="px-4 py-3 text-end">{t('table.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.topUnpaid.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {p.lastName} {p.firstName}
                    </td>
                    <td className="px-4 py-3 text-end tabular-nums text-red-700">
                      {formatNumber(p.remaining)} {data.currency}
                    </td>
                    <td className="px-4 py-3 text-end">
                      <Link
                        href={`/${locale}/admin/persons/${p.id}/finance`}
                        className="text-xs text-brand-700 hover:underline"
                      >
                        {t('table.view')}
                      </Link>
                    </td>
                  </tr>
                ))}
                {data.topUnpaid.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-10 text-center text-slate-500">
                      {t('noUnpaid')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside>
          <h2 className="mb-3 text-base font-semibold text-slate-900">{t('breakdown.title')}</h2>
          <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-5 text-sm">
            <Row label={t('breakdown.installments')} value={String(data.installmentsCount)} />
            <Row
              label={t('breakdown.paid')}
              value={String(data.paidCount)}
              color="emerald"
            />
            <Row label={t('breakdown.partial')} value={String(data.partialCount)} color="amber" />
            <Row label={t('breakdown.pending')} value={String(data.pendingCount)} color="red" />
          </div>

          <h2 className="mb-3 mt-6 text-base font-semibold text-slate-900">{t('recent.title')}</h2>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              {t('recent.last30days')}
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums text-emerald-700">
              {formatNumber(data.recentTotal)} {data.currency}
            </div>
            <div className="text-xs text-slate-500">
              {t('recent.paymentCount', { count: data.recentCount })}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function formatNumber(n: number): string {
  return n.toLocaleString('fr', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Kpi({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: 'emerald' | 'red' | 'amber';
}) {
  const colors: Record<string, string> = {
    emerald: 'text-emerald-700',
    red: 'text-red-700',
    amber: 'text-amber-700',
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl font-semibold tabular-nums ${color ? colors[color] : 'text-slate-900'}`}>
        {value}
      </div>
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: 'emerald' | 'amber' | 'red' }) {
  const colors: Record<string, string> = {
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
    red: 'text-red-700',
  };
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-700">{label}</span>
      <span className={`font-semibold tabular-nums ${color ? colors[color] : 'text-slate-900'}`}>{value}</span>
    </div>
  );
}
