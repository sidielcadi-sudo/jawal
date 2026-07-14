import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { installmentStepMonths } from '@/lib/fees';
import { loadUnpaidByFamily } from '@/lib/unpaid';
import { DistributionTabs } from './distribution';
import { YearSelect } from './year-select';

export default async function FinanceDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; year?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();
  const t = await getTranslations('admin.finance');

  const session = (await auth())!;
  const tenantId = session.user.tenantId;

  const data = await withTenant(tenantId, async (tx) => {
    const tenant = await tx.tenant.findFirst();

    // Sommes globales en JS (Decimal Prisma → Number via aggregate)
    const allInstallments = await tx.installment.findMany({
      where: { status: { not: 'CANCELLED' } },
      select: { id: true, amount: true, status: true, studentId: true, dueDate: true, feeScheduleItemId: true },
    });
    const allPayments = await tx.payment.findMany({
      select: { amount: true, paidAt: true, installmentId: true },
    });

    // Année scolaire sélectionnée → fenêtre de filtrage. KPI, listes d'impayés
    // et répartition ne comptent que les échéances dont la date tombe dans cette
    // année (12 mois à partir du début de l'année scolaire).
    const today = new Date();
    const years = await tx.academicYear.findMany({
      orderBy: { startDate: 'desc' },
      select: { id: true, label: true, active: true, startDate: true },
    });
    const activeYear = years.find((y) => y.active);
    const selectedYearId = sp.year ?? activeYear?.id ?? years[0]?.id ?? null;
    const selectedYear = years.find((y) => y.id === selectedYearId);
    const fallbackStart = new Date(
      today.getUTCMonth() >= 8 ? today.getUTCFullYear() : today.getUTCFullYear() - 1,
      8,
      1,
    );
    const ys0 = startOfMonth(selectedYear ? new Date(selectedYear.startDate) : fallbackStart);
    const yearEnd = addMonths(ys0, 12);
    const yearInstallments = allInstallments.filter((i) => i.dueDate >= ys0 && i.dueDate < yearEnd);

    let totalDue = 0;
    let totalPaid = 0;
    const paidByInst = new Map<string, number>();
    for (const p of allPayments) {
      paidByInst.set(p.installmentId, (paidByInst.get(p.installmentId) ?? 0) + Number(p.amount));
    }
    for (const i of yearInstallments) {
      totalDue += Number(i.amount);
      totalPaid += paidByInst.get(i.id) ?? 0;
    }
    const collectionRate = totalDue > 0 ? (totalPaid / totalDue) * 100 : 0;

    // Top 10 élèves en retard de paiement (totalRemaining décroissant)
    const remainingByStudent = new Map<string, number>();
    for (const i of yearInstallments) {
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
    for (const i of yearInstallments) {
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

    // ---- Histogramme : répartition par type d'échéances sur l'année ----
    // Échéances classées par cadence (pas en mois de la grille tarifaire).
    // Uniquement les frais ANNUELS (kind=ANNUAL) ; les grilles EXCEPTIONNELLES
    // et les frais ad hoc (sans grille) sont exclus.
    const schedules = await tx.feeScheduleItem.findMany({
      select: { id: true, installmentCount: true, kind: true },
    });
    const schedSetByStep = (lo: number, hi: number) =>
      new Set(
        schedules
          .filter((s) => {
            if (s.kind !== 'ANNUAL') return false;
            const st = installmentStepMonths(s.installmentCount);
            return st >= lo && st <= hi;
          })
          .map((s) => s.id),
      );
    const idsForSchedules = (sch: Set<string>) =>
      new Set(
        allInstallments.filter((i) => i.feeScheduleItemId && sch.has(i.feeScheduleItemId)).map((i) => i.id),
      );
    const monthlyIds = idsForSchedules(schedSetByStep(1, 1));
    const quarterlyIds = idsForSchedules(schedSetByStep(2, 3));
    const semestrialIds = idsForSchedules(schedSetByStep(4, 6));
    const annualIds = idsForSchedules(schedSetByStep(7, 999));
    // Vue globale : toutes les échéances liées à une grille ANNUAL (toutes cadences).
    const allAnnualIds = idsForSchedules(
      new Set(schedules.filter((s) => s.kind === 'ANNUAL').map((s) => s.id)),
    );

    const buildBuckets = (
      instIds: Set<string>,
      nBuckets: number,
      monthsPer: number,
      labelFn: (k: number, start: Date) => string,
    ) => {
      const out: { label: string; due: number; collected: number }[] = [];
      for (let k = 0; k < nBuckets; k++) {
        const s = addMonths(ys0, k * monthsPer);
        const e = addMonths(ys0, (k + 1) * monthsPer);
        let due = 0;
        for (const i of allInstallments) {
          if (instIds.has(i.id) && i.dueDate >= s && i.dueDate < e) due += Number(i.amount);
        }
        let collected = 0;
        for (const p of allPayments) {
          if (instIds.has(p.installmentId) && p.paidAt >= s && p.paidAt < e) collected += Number(p.amount);
        }
        out.push({ label: labelFn(k, s), due, collected });
      }
      return out;
    };
    const monthLabel = (_k: number, s: Date) => s.toLocaleDateString(locale, { month: 'short' });
    const globalHisto = buildBuckets(allAnnualIds, 12, 1, monthLabel);
    const monthlyHisto = buildBuckets(monthlyIds, 12, 1, monthLabel);
    const quarterlyHisto = buildBuckets(quarterlyIds, 4, 3, (k) => `T${k + 1}`);
    const semestrialHisto = buildBuckets(semestrialIds, 2, 6, (k) => `S${k + 1}`);
    const annualHisto = buildBuckets(annualIds, 12, 1, monthLabel);

    // Impayés groupés par famille (à la date du jour).
    const unpaid = await loadUnpaidByFamily(tx);

    return {
      currency: tenant?.currency ?? 'MAD',
      totalDue,
      totalPaid,
      totalRemaining: Math.max(0, totalDue - totalPaid),
      collectionRate,
      installmentsCount: yearInstallments.length,
      paidCount: yearInstallments.filter((i) => i.status === 'PAID').length,
      pendingCount: yearInstallments.filter((i) => i.status === 'PENDING').length,
      partialCount: yearInstallments.filter((i) => i.status === 'PARTIAL').length,
      topUnpaid: topUnpaid.map((p) => ({
        ...p,
        remaining: remainingByStudent.get(p.id) ?? 0,
      })),
      studentList,
      recentTotal,
      recentCount: recent.length,
      globalHisto,
      monthlyHisto,
      quarterlyHisto,
      semestrialHisto,
      annualHisto,
      unpaidFamiliesCount: unpaid.familiesCount,
      topFamilies: unpaid.families.slice(0, 6),
      years: years.map((y) => ({ id: y.id, label: y.label, active: y.active })),
      selectedYearId,
    };
  });

  return (
    <div className="px-3 py-3">
      <header className="relative mb-4 flex flex-wrap items-center justify-between gap-3 -mx-3 rounded-2xl border border-brand-200 bg-gradient-to-r from-brand-100 to-brand-50 shadow-sm px-4 py-2.5">
        <div>
          <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-slate-600">{t('subtitle')}</p>
        </div>
        {/* Sélecteur d'année centré (auto-submit, sans bouton) */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 lg:block">
          <div className="pointer-events-auto">
            <YearSelect years={data.years} selectedYearId={data.selectedYearId} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="lg:hidden">
            <YearSelect years={data.years} selectedYearId={data.selectedYearId} />
          </div>
          <Link
            href={`/${locale}/admin/finance/expenses`}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {t('expensesLink')}
          </Link>
          <Link
            href={`/${locale}/admin/finance/exceptional`}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            {t('exceptionalLink')}
          </Link>
          <Link
            href={`/${locale}/admin/finance/unpaid`}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            {t('unpaid.manageLink')}
          </Link>
          <Link
            href={`/${locale}/admin/finance/creances-annulees`}
            className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600"
          >
            {t('waivedLink')}
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
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
        <Kpi
          label={t('unpaid.familiesKpi')}
          value={String(data.unpaidFamiliesCount)}
          color={data.unpaidFamiliesCount > 0 ? 'red' : 'emerald'}
        />
      </div>

      {/* Répartition annuelle par type d’échéances (mensuel / trimestriel / semestriel) */}
      <DistributionTabs
        data={{
          global: data.globalHisto,
          monthly: data.monthlyHisto,
          quarterly: data.quarterlyHisto,
          semestrial: data.semestrialHisto,
          annual: data.annualHisto,
        }}
        currency={data.currency}
      />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900">{t('unpaid.topTitle')}</h2>
            <Link href={`/${locale}/admin/finance/unpaid`} className="text-xs text-brand-700 hover:underline">
              {t('unpaid.seeAll')} →
            </Link>
          </div>
          <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-[#A9EAFE] text-xs uppercase tracking-wide text-slate-700">
                <tr>
                  <th className="px-4 py-3 text-start">{t('unpaid.family')}</th>
                  <th className="px-4 py-3 text-end">{t('unpaid.impaye')}</th>
                  <th className="px-4 py-3 text-end">{t('unpaid.daysLate')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.topFamilies.map((f) => (
                  <tr key={f.familyId}>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {f.familyName}
                      {f.studentCount > 1 && (
                        <span className="ms-1 text-xs text-slate-400">({f.studentCount})</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-end tabular-nums font-semibold text-red-700">
                      {formatNumber(f.totalUnpaid)} {data.currency}
                    </td>
                    <td className="px-4 py-3 text-end tabular-nums text-amber-700">
                      {t('unpaid.days', { count: f.daysLate })}
                    </td>
                  </tr>
                ))}
                {data.topFamilies.length === 0 && (
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

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
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
