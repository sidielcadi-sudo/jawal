import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';

export default async function FinanceDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const q = ((await searchParams).q ?? '').trim();
  const t = await getTranslations('admin.finance');

  const session = (await auth())!;
  const tenantId = session.user.tenantId;

  const data = await withTenant(tenantId, async (tx) => {
    const tenant = await tx.tenant.findFirst();

    // Sommes globales en JS (Decimal Prisma → Number via aggregate)
    const allInstallments = await tx.installment.findMany({
      where: { status: { not: 'CANCELLED' } },
      select: { id: true, amount: true, status: true, studentId: true, dueDate: true },
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

    // Statut par élève basé sur la date d'échéance :
    //  - Soldé : plus rien à payer ;
    //  - En retard : au moins une échéance impayée dont la date est dépassée ;
    //  - À jour : reste à payer mais aucune échéance encore échue.
    const now = new Date();
    const dueByStudent = new Map<string, number>();
    const overdueByStudent = new Set<string>();
    for (const i of allInstallments) {
      dueByStudent.set(i.studentId, (dueByStudent.get(i.studentId) ?? 0) + Number(i.amount));
      const rem = Number(i.amount) - (paidByInst.get(i.id) ?? 0);
      if (rem > 0 && i.dueDate < now) overdueByStudent.add(i.studentId);
    }
    const studentIds = [...dueByStudent.keys()];
    const persons = studentIds.length
      ? await tx.person.findMany({
          where: {
            id: { in: studentIds },
            ...(q
              ? {
                  OR: [
                    { firstName: { contains: q, mode: 'insensitive' } },
                    { lastName: { contains: q, mode: 'insensitive' } },
                  ],
                }
              : {}),
          },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const statusRank = { LATE: 0, UPTODATE: 1, PAID: 2 } as const;
    const studentList = persons
      .map((p) => {
        const remaining = remainingByStudent.get(p.id) ?? 0;
        const status: 'PAID' | 'LATE' | 'UPTODATE' =
          remaining <= 0 ? 'PAID' : overdueByStudent.has(p.id) ? 'LATE' : 'UPTODATE';
        return {
          id: p.id,
          name: `${p.lastName} ${p.firstName}`,
          due: dueByStudent.get(p.id) ?? 0,
          remaining,
          status,
        };
      })
      .sort(
        (a, b) =>
          statusRank[a.status] - statusRank[b.status] ||
          b.remaining - a.remaining ||
          a.name.localeCompare(b.name),
      )
      .slice(0, 100);

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
      studentList,
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

      {/* Recherche élève (tous statuts, basé sur la date d'échéance) */}
      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">{t('students.title')}</h2>
          <form method="get" className="flex items-end gap-2">
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder={t('students.searchPlaceholder')}
              className="focus:border-brand-500 focus:ring-brand-500 w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1"
            />
            <button
              type="submit"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              {t('students.search')}
            </button>
          </form>
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-start">{t('table.student')}</th>
                <th className="px-4 py-3 text-end">{t('students.due')}</th>
                <th className="px-4 py-3 text-end">{t('table.remaining')}</th>
                <th className="px-4 py-3 text-start">{t('students.status')}</th>
                <th className="px-4 py-3 text-end">{t('table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.studentList.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{s.name}</td>
                  <td className="px-4 py-3 text-end tabular-nums text-slate-600">
                    {formatNumber(s.due)} {data.currency}
                  </td>
                  <td
                    className={`px-4 py-3 text-end tabular-nums ${
                      s.remaining > 0 ? 'text-red-700' : 'text-emerald-700'
                    }`}
                  >
                    {formatNumber(s.remaining)} {data.currency}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        s.status === 'PAID'
                          ? 'bg-emerald-100 text-emerald-700'
                          : s.status === 'LATE'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {t(`students.statusLabel.${s.status}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-end">
                    <Link
                      href={`/${locale}/admin/persons/${s.id}/finance`}
                      className="text-xs text-brand-700 hover:underline"
                    >
                      {t('table.view')}
                    </Link>
                  </td>
                </tr>
              ))}
              {data.studentList.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    {t('students.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
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
