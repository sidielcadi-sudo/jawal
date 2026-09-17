'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ChartCanvas } from '@/components/charts/chart-canvas';
import {
  collectionRate,
  FIN_CATS,
  mergeTotals,
  pctChange,
  recoveryRate,
  siteHealth,
  siteTotals,
  type FinCat,
  type FinTotals,
  type Health,
} from '@/lib/group-finance';
import type { GroupFinanceData, FinanceSite } from './finance-data';

const CAT_COLORS: Record<FinCat, string> = {
  TUITION: '#1e3a8a',
  INSCRIPTION: '#a855f7',
  CANTEEN: '#10b981',
  TRANSPORT: '#f59e0b',
  DAYCARE: '#ec4899',
  SUPPORT: '#0ea5e9',
  EXCEPTIONAL: '#64748b',
  OTHER: '#cbd5e1',
};

const HEALTH_TONE: Record<Health, string> = {
  good: 'border-emerald-200 bg-emerald-100 text-emerald-800',
  watch: 'border-amber-200 bg-amber-100 text-amber-800',
  risk: 'border-red-200 bg-red-100 text-red-800',
  none: 'border-slate-200 bg-slate-100 text-slate-500',
};

/**
 * Onglet Finance de la vue groupe : facturation, encaissement et reste à
 * recouvrer consolidés, puis le détail par établissement.
 */
export function GroupFinance({
  data,
  locale,
  target,
}: {
  data: GroupFinanceData;
  locale: string;
  /** Objectif de recouvrement du groupe, en %. */
  target: number;
}) {
  const t = useTranslations('admin.group.finance');
  const [yearKey, setYearKey] = useState<'current' | 'previous'>('current');
  const [periodKey, setPeriodKey] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [health, setHealth] = useState<Health | 'all'>('all');
  const [detail, setDetail] = useState<string | null>(null);

  const currency = data.sites[0]?.currency ?? 'MAD';
  const money = (n: number) => `${Math.round(n).toLocaleString(locale)} ${currency}`;
  const pct = (v: number | null) => (v === null ? '—' : `${v.toLocaleString(locale)} %`);
  const months = data.periods.find((p) => p.key === periodKey)?.months ?? null;

  const rows = useMemo(
    () =>
      data.sites.map((s) => {
        const cur = siteTotals(yearKey === 'current' ? s.current : s.previous, months);
        const prev = yearKey === 'current' ? siteTotals(s.previous, months) : null;
        return { site: s, totals: cur, prev, health: siteHealth(recoveryRate(cur)) };
      }),
    [data.sites, yearKey, months],
  );
  const g = mergeTotals(rows.map((r) => r.totals));
  const gPrev = yearKey === 'current' && data.previousLabel ? mergeTotals(rows.map((r) => r.prev!)) : null;
  const billedDelta = gPrev ? pctChange(g.billed, gPrev.billed) : null;
  const collected = collectionRate(g);
  const recovery = recoveryRate(g);
  const remaining = g.overdue + g.upcoming;

  const q = search.trim().toLowerCase();
  const tableRows = rows.filter(
    (r) => (!q || r.site.name.toLowerCase().includes(q)) && (health === 'all' || r.health === health),
  );

  const yearLabel = (yearKey === 'current' ? data.currentLabel : data.previousLabel) ?? '—';
  const alerts = [...rows].filter((r) => r.totals.overdue > 0).sort((a, b) => b.totals.overdue - a.totals.overdue).slice(0, 3);
  const forecastTotal = data.sites.reduce((s, x) => s + x.forecast.reduce((n, f) => n + f.amount, 0), 0);
  const forecastMonths = (data.sites[0]?.forecast ?? []).map((f, i) => ({
    month: f.month,
    amount: data.sites.reduce((s, x) => s + (x.forecast[i]?.amount ?? 0), 0),
  }));
  const monthName = (iso: string) =>
    new Date(`${iso}-01T00:00:00Z`).toLocaleDateString(locale, { month: 'long', timeZone: 'UTC' });

  const k = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)));
  // Chart.js : barres groupées (facturé / encaissé / échu par établissement)
  // et anneau des encaissements par type de frais. La légende native barre
  // une série au clic pour la masquer.
  const barConfig = {
    type: 'bar',
    data: {
      labels: rows.map((r) => r.site.name),
      datasets: [
        { label: t('billed'), data: rows.map((r) => r.totals.billed), backgroundColor: '#1e3a8a', borderRadius: 6 },
        { label: t('collected'), data: rows.map((r) => r.totals.collected), backgroundColor: '#10b981', borderRadius: 6 },
        { label: t('overdue'), data: rows.map((r) => r.totals.overdue), backgroundColor: '#ef4444', borderRadius: 6 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8 } },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: (ctx: { dataset: { label?: string }; parsed: { y: number } }) =>
              `${ctx.dataset.label} : ${money(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: '#f1f5f9' }, ticks: { callback: (v: number | string) => k(Number(v)) } },
      },
    },
  };
  const paidCats = FIN_CATS.filter((c) => g.byCat[c].collected > 0);
  const doughnutConfig = {
    type: 'doughnut',
    data: {
      labels: paidCats.map((c) => t(`cats.${c}`)),
      datasets: [
        {
          data: paidCats.map((c) => g.byCat[c].collected),
          backgroundColor: paidCats.map((c) => CAT_COLORS[c]),
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } },
        tooltip: {
          callbacks: {
            label: (ctx: { label?: string; parsed: number }) =>
              `${ctx.label} : ${money(ctx.parsed)} (${g.collected > 0 ? Math.round((ctx.parsed / g.collected) * 100) : 0} %)`,
          },
        },
      },
    },
  };
  const opened = rows.find((r) => r.site.tenantId === detail) ?? null;

  const chip = (active: boolean) =>
    `rounded-lg px-2.5 py-1 text-xs font-medium ${active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`;

  return (
    <div className="space-y-4">
      {/* ── En-tête et filtres ─────────────────────────────────────────── */}
      <header className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-center">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{t('title')}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{t('subtitle', { year: yearLabel })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1">
            <span className="px-2 text-xs text-slate-500">{t('year')}</span>
            <button type="button" className={chip(yearKey === 'current')} onClick={() => setYearKey('current')}>
              {data.currentLabel ?? '—'}
            </button>
            {data.previousLabel && (
              <button type="button" className={chip(yearKey === 'previous')} onClick={() => setYearKey('previous')}>
                {data.previousLabel}
              </button>
            )}
          </div>
          <select
            value={periodKey}
            onChange={(e) => setPeriodKey(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-100 p-2 text-xs font-medium text-slate-700"
          >
            <option value="all">{t('periodAll')}</option>
            {data.periods.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700"
          >
            🖨 {t('print')}
          </button>
        </div>
      </header>

      {/* ── Indicateurs consolidés ─────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard title={t('kpi.billed')} icon="🧾" iconTone="bg-blue-50 text-blue-600">
          <p className="text-2xl font-extrabold tabular-nums text-slate-900">{money(g.billed)}</p>
          <p className="mt-2 text-xs">
            {billedDelta === null ? (
              <span className="text-slate-400">{t('kpi.noPrev')}</span>
            ) : (
              <>
                <span className={`font-bold ${billedDelta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {billedDelta >= 0 ? '▲ +' : '▼ '}
                  {billedDelta.toLocaleString(locale)} %
                </span>{' '}
                <span className="text-slate-400">{t('kpi.vsPrev', { amount: money(gPrev!.billed) })}</span>
              </>
            )}
          </p>
          <Bar parts={[{ w: 100, c: 'bg-blue-600' }]} />
        </KpiCard>

        <KpiCard title={t('kpi.collected')} icon="🏦" iconTone="bg-emerald-50 text-emerald-600">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-2xl font-extrabold tabular-nums text-emerald-600">{money(g.collected)}</p>
            <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-extrabold text-emerald-700">
              {pct(collected)}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500">{t('kpi.collectedSub')}</p>
          <Bar parts={[{ w: collected ?? 0, c: 'bg-emerald-500' }]} />
        </KpiCard>

        <KpiCard title={t('kpi.remaining')} icon="🤲" iconTone="bg-amber-50 text-amber-600">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-2xl font-extrabold tabular-nums text-slate-900">{money(remaining)}</p>
            <span className="text-xs font-semibold text-slate-500">
              {t('kpi.ofBilled', { pct: pct(g.billed > 0 ? Math.round((remaining / g.billed) * 1000) / 10 : null) })}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-1 text-xs">
            <span className="font-semibold text-amber-600">
              {t('kpi.upcoming')} <strong>{money(g.upcoming)}</strong>
            </span>
            <span className="font-bold text-red-600">
              {t('kpi.overdue')} <strong>{money(g.overdue)}</strong>
            </span>
          </div>
          <Bar
            parts={
              remaining > 0
                ? [
                    { w: (g.upcoming / remaining) * 100, c: 'bg-amber-400' },
                    { w: (g.overdue / remaining) * 100, c: 'bg-red-500' },
                  ]
                : []
            }
          />
        </KpiCard>

        <KpiCard title={t('kpi.recovery')} icon="📈" iconTone="bg-purple-50 text-purple-600">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-2xl font-extrabold tabular-nums text-purple-900">{pct(recovery)}</p>
            <span className="text-xs font-bold text-slate-600">{t('kpi.target', { target })}</span>
          </div>
          <p className="mt-2 text-xs">
            {recovery === null ? (
              <span className="text-slate-400">—</span>
            ) : recovery >= target ? (
              <span className="font-semibold text-emerald-600">✔ {t('kpi.onTarget')}</span>
            ) : (
              <span className="font-semibold text-amber-600">
                ⚠ {t('kpi.gap', { gap: (Math.round((recovery - target) * 10) / 10).toLocaleString(locale) })}
              </span>
            )}
          </p>
          <Bar parts={[{ w: recovery ?? 0, c: 'bg-purple-600' }]} />
        </KpiCard>
      </section>

      {/* ── Tableau par établissement ─────────────────────────────────── */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-100 p-4 md:flex-row md:items-center">
          <div>
            <h3 className="text-base font-bold text-slate-900">🏫 {t('table.title')}</h3>
            <p className="mt-0.5 text-xs text-slate-500">{t('table.subtitle')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('table.search')}
              className="min-w-[200px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs"
            />
            <select
              value={health}
              onChange={(e) => setHealth(e.target.value as Health | 'all')}
              className="rounded-lg border border-slate-200 bg-slate-50 p-1.5 text-xs font-medium text-slate-700"
            >
              <option value="all">{t('table.allHealth')}</option>
              {(['good', 'watch', 'risk'] as const).map((h) => (
                <option key={h} value={h}>
                  {t(`health.${h}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-slate-600">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 text-start">{t('table.site')}</th>
                <th className="px-4 py-3 text-center">{t('table.students')}</th>
                <th className="px-4 py-3 text-end">{t('billed')}</th>
                <th className="px-4 py-3 text-end">{t('collected')}</th>
                <th className="px-4 py-3 text-center">{t('table.rate')}</th>
                <th className="px-4 py-3 text-end">{t('overdue')}</th>
                <th className="px-4 py-3 text-center">{t('table.health')}</th>
                <th className="px-4 py-3 text-center">{t('table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {tableRows.map((r) => {
                const rate = collectionRate(r.totals);
                return (
                  <tr key={r.site.tenantId} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-bold text-slate-900">
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: r.site.color }} />
                        {r.site.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">{t('table.studentsCount', { count: r.site.students })}</td>
                    <td className="px-4 py-3 text-end font-semibold tabular-nums text-slate-900">{money(r.totals.billed)}</td>
                    <td className="px-4 py-3 text-end font-extrabold tabular-nums text-emerald-600">{money(r.totals.collected)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="hidden h-1.5 w-12 overflow-hidden rounded-full bg-slate-100 sm:block">
                          <span className="block h-full bg-emerald-500" style={{ width: `${Math.min(100, rate ?? 0)}%` }} />
                        </span>
                        <span className="font-bold text-slate-800">{pct(rate)}</span>
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-end font-bold tabular-nums ${r.totals.overdue > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                      {money(r.totals.overdue)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${HEALTH_TONE[r.health]}`}>
                        {t(`health.${r.health}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => setDetail(r.site.tenantId)}
                        className="text-xs font-semibold text-brand-700 hover:underline"
                      >
                        {t('table.details')}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {tableRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    {t('table.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Graphiques (Chart.js) ──────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 lg:col-span-2">
          <h3 className="text-sm font-bold text-slate-900">📊 {t('charts.compare')}</h3>
          <p className="mb-3 text-xs text-slate-500">{t('charts.compareHint', { currency })}</p>
          {g.billed > 0 ? (
            <ChartCanvas
              config={barConfig}
              deps={JSON.stringify(barConfig.data)}
              height={280}
              label={t('charts.compare')}
            />
          ) : (
            <p className="py-10 text-center text-sm text-slate-400">{t('charts.empty')}</p>
          )}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-bold text-slate-900">🥧 {t('charts.categories')}</h3>
          <p className="mb-3 text-xs text-slate-500">{t('charts.categoriesHint')}</p>
          {paidCats.length > 0 ? (
            <ChartCanvas
              config={doughnutConfig}
              deps={JSON.stringify(doughnutConfig.data)}
              height={280}
              label={t('charts.categories')}
            />
          ) : (
            <p className="py-10 text-center text-sm text-slate-400">{t('charts.empty')}</p>
          )}
        </div>
      </section>

      {/* ── Alertes et prévisionnel ─────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-s-4 border-slate-200 border-s-red-500 bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">⚠ {t('alerts.title')}</h3>
            {alerts.length > 0 && (
              <span className="rounded bg-red-100 px-2 py-0.5 text-[10px] font-extrabold uppercase text-red-700">
                {t('alerts.urgent')}
              </span>
            )}
          </div>
          <p className="mb-3 text-xs text-slate-500">{t('alerts.hint')}</p>
          <div className="space-y-2">
            {alerts.map((r) => (
              <div
                key={r.site.tenantId}
                className={`flex items-start justify-between gap-3 rounded-xl border p-3 ${
                  r.health === 'risk' ? 'border-red-100 bg-red-50/50' : 'border-amber-100 bg-amber-50/50'
                }`}
              >
                <div className="text-xs">
                  <span className="block font-bold text-slate-900">{r.site.name}</span>
                  <span className={`font-semibold ${r.health === 'risk' ? 'text-red-600' : 'text-amber-700'}`}>
                    {t('alerts.overdue', { amount: money(r.totals.overdue) })}
                  </span>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {t('alerts.detail', { over60: money(r.totals.over60), families: r.totals.families })}
                  </p>
                </div>
                {r.site.isCurrent ? (
                  <Link
                    href={`/${locale}/admin/finance/unpaid?status=ECHU`}
                    className="whitespace-nowrap rounded-lg bg-red-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-red-700"
                  >
                    {t('alerts.remind')}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => setDetail(r.site.tenantId)}
                    className="whitespace-nowrap rounded-lg bg-amber-500 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-amber-600"
                  >
                    {t('table.details')}
                  </button>
                )}
              </div>
            ))}
            {alerts.length === 0 && <p className="text-xs text-emerald-700">✔ {t('alerts.none')}</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900">💹 {t('forecast.title')}</h3>
              <p className="text-xs text-slate-500">{t('forecast.hint')}</p>
            </div>
            <span className="rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-600">
              {t('forecast.total', { amount: money(forecastTotal) })}
            </span>
          </div>
          <div className="my-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {forecastMonths.map((f, i) => (
              <div key={f.month} className="rounded-xl border border-slate-200/60 bg-slate-50 p-3">
                <span className="block text-[11px] font-semibold uppercase text-slate-400">
                  {t('forecast.month', { n: i + 1, month: monthName(f.month) })}
                </span>
                <span className="text-lg font-extrabold tabular-nums text-slate-800">{money(f.amount)}</span>
              </div>
            ))}
          </div>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            {forecastTotal > 0 &&
              forecastMonths.map((f, i) => (
                <div
                  key={f.month}
                  className={['bg-emerald-500', 'bg-blue-500', 'bg-amber-400'][i % 3]}
                  style={{ width: `${(f.amount / forecastTotal) * 100}%` }}
                  title={`${monthName(f.month)} : ${money(f.amount)}`}
                />
              ))}
          </div>
        </div>
      </section>

      {opened && (
        <SiteModal
          site={opened.site}
          totals={opened.totals}
          money={money}
          onClose={() => setDetail(null)}
          t={t}
        />
      )}
    </div>
  );
}

function KpiCard({
  title,
  icon,
  iconTone,
  children,
}: {
  title: string;
  icon: string;
  iconTone: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
        <span>{title}</span>
        <span className={`grid h-9 w-9 place-items-center rounded-xl text-sm ${iconTone}`}>{icon}</span>
      </div>
      {children}
    </div>
  );
}

function Bar({ parts }: { parts: Array<{ w: number; c: string }> }) {
  return (
    <div className="mt-3 flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      {parts.map((p, i) => (
        <div key={i} className={`h-full ${p.c}`} style={{ width: `${Math.max(0, Math.min(100, p.w))}%` }} />
      ))}
    </div>
  );
}

function SiteModal({
  site,
  totals,
  money,
  onClose,
  t,
}: {
  site: FinanceSite;
  totals: FinTotals;
  money: (n: number) => string;
  onClose: () => void;
  t: ReturnType<typeof useTranslations<'admin.group.finance'>>;
}) {
  const unpaid = FIN_CATS.filter((c) => totals.byCat[c].overdue > 0);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute end-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-500 hover:text-slate-700"
          aria-label={t('modal.close')}
        >
          ✕
        </button>
        <h3 className="text-lg font-bold text-slate-900">{site.name}</h3>
        <div className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ModalStat label={t('table.students')} value={String(site.students)} tone="text-slate-900" />
          <ModalStat label={t('billed')} value={money(totals.billed)} tone="text-blue-700" />
          <ModalStat label={t('collected')} value={money(totals.collected)} tone="text-emerald-700" />
          <ModalStat label={t('overdue')} value={money(totals.overdue)} tone="text-red-600" />
        </div>
        <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">{t('modal.breakdown')}</h4>
        <div className="space-y-2 text-xs">
          {unpaid.map((c) => (
            <div key={c} className="flex items-center justify-between rounded-lg bg-slate-50 p-2">
              <span className="text-slate-700">{t(`cats.${c}`)}</span>
              <span className="font-bold text-slate-900">
                {money(totals.byCat[c].overdue)} · {t('modal.families', { count: totals.byCat[c].families })}
              </span>
            </div>
          ))}
          {unpaid.length === 0 && <p className="text-emerald-700">✔ {t('modal.noUnpaid')}</p>}
        </div>
        <div className="mt-6 flex justify-end border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
          >
            {t('modal.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalStat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-3">
      <span className="block text-[10px] font-semibold uppercase text-slate-400">{label}</span>
      <span className={`text-base font-bold tabular-nums ${tone}`}>{value}</span>
    </div>
  );
}
