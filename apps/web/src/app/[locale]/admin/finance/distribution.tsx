'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';

type Bucket = { label: string; due: number; collected: number };
type Data = { global: Bucket[]; monthly: Bucket[]; quarterly: Bucket[]; semestrial: Bucket[]; annual: Bucket[] };
type TabKey = 'global' | 'monthly' | 'quarterly' | 'semestrial' | 'annual';

export function DistributionTabs({ data, currency }: { data: Data; currency: string }) {
  const t = useTranslations('admin.finance.histo');
  const [tab, setTab] = useState<TabKey>('global');
  const tabs: { key: TabKey; label: string }[] = [
    { key: 'global', label: t('tabGlobal') },
    { key: 'monthly', label: t('tabMonthly') },
    { key: 'quarterly', label: t('tabQuarterly') },
    { key: 'semestrial', label: t('tabSemestrial') },
    { key: 'annual', label: t('tabAnnual') },
  ];
  const current = data[tab];

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold text-slate-900">{t('sectionTitle')}</h2>

      <div className="mt-3 flex flex-wrap gap-1 border-b border-slate-200">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            type="button"
            onClick={() => setTab(tb.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === tb.key
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-3 text-xs text-slate-600">
        <Legend className="bg-blue-500" label={t('due')} />
        <Legend className="bg-gray-400" label={t('collected')} />
        <Legend className="bg-orange-500" label={t('unpaid')} />
      </div>

      <Histogram data={current} currency={currency} />
      <DistTable data={current} currency={currency} />
    </section>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 rounded-sm ${className}`} />
      {label}
    </span>
  );
}

function nf(n: number, locale: string): string {
  return n.toLocaleString(locale, { maximumFractionDigits: 0 });
}

function Histogram({ data, currency }: { data: Bucket[]; currency: string }) {
  const locale = useLocale();
  const W = 1000;
  const H = 300;
  const padL = 38;
  const padR = 8;
  const padT = 12;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const baseY = padT + plotH;
  const max = Math.max(1, ...data.map((d) => Math.max(d.due, d.collected)));
  const slotW = plotW / Math.max(1, data.length);
  const yFor = (v: number) => baseY - (v / max) * plotH;
  const hFor = (v: number) => (v / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const compact = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${Math.round(n)}`;
  const fmt = (v: number) => `${nf(v, locale)} ${currency}`;
  // Libellés des séries pour les info-bulles.
  const seriesNames = ['Dû', 'Encaissé', 'Impayé'];

  return (
    <div className="mt-3 w-full">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="aspect-[10/3] w-full" role="img">
        {ticks.map((tk, i) => {
          const y = yFor(tk);
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#e2e8f0" strokeWidth={1} />
              <text x={padL - 6} y={y + 3} textAnchor="end" fontSize={9} fill="#94a3b8">
                {compact(tk)}
              </text>
            </g>
          );
        })}
        <line x1={padL} y1={padT} x2={padL} y2={baseY} stroke="#cbd5e1" strokeWidth={1} />
        <line x1={padL} y1={baseY} x2={W - padR} y2={baseY} stroke="#cbd5e1" strokeWidth={1} />
        {data.map((d, k) => {
          const cx = padL + slotW * (k + 0.5);
          const unpaid = Math.max(0, d.due - d.collected);
          const vals = [
            { v: d.due, fill: '#3b82f6' },
            { v: d.collected, fill: '#9ca3af' },
            { v: unpaid, fill: '#f97316' },
          ];
          const innerGap = 1.5;
          const groupW = Math.min(slotW * 0.55, 220);
          const barW = (groupW - innerGap * 2) / 3;
          const startX = cx - groupW / 2;
          return (
            <g key={k}>
              {vals.map((b, bi) => (
                <rect
                  key={bi}
                  x={startX + bi * (barW + innerGap)}
                  y={yFor(b.v)}
                  width={barW}
                  height={hFor(b.v)}
                  rx={1.5}
                  fill={b.fill}
                >
                  <title>{`${d.label} — ${seriesNames[bi]}: ${fmt(b.v)}`}</title>
                </rect>
              ))}
              <text x={cx} y={baseY + 14} textAnchor="middle" fontSize={9} fill="#64748b" className="capitalize">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function DistTable({ data, currency }: { data: Bucket[]; currency: string }) {
  void currency;
  const t = useTranslations('admin.finance.histo');
  const locale = useLocale();
  const dueArr = data.map((d) => d.due);
  const collArr = data.map((d) => d.collected);
  const unpaidArr = data.map((d) => Math.max(0, d.due - d.collected));
  const cumulate = (arr: number[]) => {
    let r = 0;
    return arr.map((v) => (r += v));
  };
  const sum = (arr: number[]) => arr.reduce((s, v) => s + v, 0);
  const last = (arr: number[]) => arr[arr.length - 1] ?? 0;
  const fmt = (n: number) => nf(n, locale);

  const cumulDue = cumulate(dueArr);
  const cumulColl = cumulate(collArr);
  const cumulUnpaid = cumulate(unpaidArr);

  return (
    <div className="mt-5 overflow-x-auto">
      <table className="w-full min-w-[640px] text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th className="px-2 py-1.5 text-start font-medium" />
            {data.map((d, i) => (
              <th key={i} className="px-2 py-1.5 text-end font-medium capitalize">
                {d.label}
              </th>
            ))}
            <th className="px-2 py-1.5 text-end font-semibold text-slate-700">{t('total')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          <SeriesRow dot="bg-blue-500" label={t('due')} values={dueArr} total={sum(dueArr)} fmt={fmt} />
          <CumulRow tint="bg-blue-50 text-blue-700" label={t('cumul')} values={cumulDue} total={last(cumulDue)} fmt={fmt} />
          <SeriesRow dot="bg-gray-400" label={t('collected')} values={collArr} total={sum(collArr)} fmt={fmt} />
          <CumulRow tint="bg-slate-100 text-slate-700" label={t('cumul')} values={cumulColl} total={last(cumulColl)} fmt={fmt} />
          <SeriesRow dot="bg-orange-500" label={t('unpaid')} values={unpaidArr} total={sum(unpaidArr)} fmt={fmt} />
          <CumulRow tint="bg-orange-50 text-orange-700" label={t('cumul')} values={cumulUnpaid} total={last(cumulUnpaid)} fmt={fmt} />
        </tbody>
      </table>
    </div>
  );
}

function SeriesRow({
  dot,
  label,
  values,
  total,
  fmt,
}: {
  dot: string;
  label: string;
  values: number[];
  total: number;
  fmt: (n: number) => string;
}) {
  return (
    <tr>
      <td className="px-2 py-1.5">
        <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
          <span className={`h-2.5 w-2.5 rounded-sm ${dot}`} /> {label}
        </span>
      </td>
      {values.map((v, i) => (
        <td key={i} className="px-2 py-1.5 text-end tabular-nums text-slate-600">
          {fmt(v)}
        </td>
      ))}
      <td className="px-2 py-1.5 text-end font-semibold tabular-nums">{fmt(total)}</td>
    </tr>
  );
}

function CumulRow({
  tint,
  label,
  values,
  total,
  fmt,
}: {
  tint: string;
  label: string;
  values: number[];
  total: number;
  fmt: (n: number) => string;
}) {
  return (
    <tr className={tint}>
      <td className="px-2 py-1.5 font-semibold">↳ {label}</td>
      {values.map((v, i) => (
        <td key={i} className="px-2 py-1.5 text-end font-medium tabular-nums">
          {fmt(v)}
        </td>
      ))}
      <td className="px-2 py-1.5 text-end font-bold tabular-nums">{fmt(total)}</td>
    </tr>
  );
}
