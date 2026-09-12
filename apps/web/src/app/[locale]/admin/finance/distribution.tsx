'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';

type Bucket = { label: string; due: number; collected: number };
type Data = { global: Bucket[]; monthly: Bucket[]; quarterly: Bucket[]; semestrial: Bucket[]; annual: Bucket[] };
type TabKey = 'global' | 'monthly' | 'quarterly' | 'semestrial' | 'annual' | 'activity' | 'method';
type MethodSlice = { method: string; amount: number };

export function DistributionTabs({
  data,
  byActivity,
  byMethod,
  currency,
}: {
  data: Data;
  byActivity: Bucket[];
  byMethod: MethodSlice[];
  currency: string;
}) {
  const t = useTranslations('admin.finance.histo');
  const [tab, setTab] = useState<TabKey>('global');
  const tabs: { key: TabKey; label: string }[] = [
    { key: 'global', label: t('tabGlobal') },
    { key: 'monthly', label: t('tabMonthly') },
    { key: 'quarterly', label: t('tabQuarterly') },
    { key: 'semestrial', label: t('tabSemestrial') },
    { key: 'annual', label: t('tabAnnual') },
    { key: 'activity', label: t('tabActivity') },
    { key: 'method', label: t('tabMethod') },
  ];

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

      {tab === 'method' ? (
        <MethodPie data={byMethod} currency={currency} />
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-end gap-3 text-xs text-slate-600">
            <Legend className="bg-blue-500" label={t('due')} />
            <Legend className="bg-gray-400" label={t('collected')} />
            <Legend className="bg-orange-500" label={t('unpaid')} />
          </div>
          <Histogram data={tab === 'activity' ? byActivity : data[tab]} currency={currency} />
          <DistTable data={tab === 'activity' ? byActivity : data[tab]} currency={currency} />
        </>
      )}
    </section>
  );
}

const METHOD_COLORS: Record<string, string> = {
  CASH: '#10b981',
  CHEQUE: '#3b82f6',
  TRANSFER: '#8b5cf6',
  CMI: '#f59e0b',
  STRIPE: '#ec4899',
  OTHER: '#64748b',
};

/** Camembert (donut) des montants encaissés par moyen de paiement. */
function MethodPie({ data, currency }: { data: MethodSlice[]; currency: string }) {
  const th = useTranslations('admin.finance.histo');
  const tm = useTranslations('admin.finance.methods');
  const locale = useLocale();
  const total = data.reduce((s, d) => s + d.amount, 0);
  const fmt = (n: number) => `${nf(n, locale)} ${currency}`;
  if (total <= 0) {
    return <p className="mt-6 text-sm text-slate-500">{th('methodEmpty')}</p>;
  }
  const R = 70;
  const sw = 34;
  const cx = 90;
  const cy = 90;
  const circ = 2 * Math.PI * R;
  let offset = 0;
  const segs = data.map((d) => {
    const frac = d.amount / total;
    const len = frac * circ;
    const seg = {
      method: d.method,
      amount: d.amount,
      frac,
      len,
      off: offset,
      color: METHOD_COLORS[d.method] ?? '#64748b',
    };
    offset -= len;
    return seg;
  });
  const compact =
    total >= 1_000_000
      ? `${(total / 1_000_000).toFixed(1)}M`
      : total >= 1000
        ? `${Math.round(total / 1000)}k`
        : `${Math.round(total)}`;

  return (
    <div className="mt-5 flex flex-col items-center gap-8 sm:flex-row">
      <svg viewBox="0 0 180 180" className="h-44 w-44 shrink-0" role="img" aria-label={th('collected')}>
        {segs.map((s, i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={R}
            fill="none"
            stroke={s.color}
            strokeWidth={sw}
            strokeDasharray={`${s.len} ${circ - s.len}`}
            strokeDashoffset={s.off}
            transform={`rotate(-90 ${cx} ${cy})`}
          >
            <title>{`${tm(s.method)}: ${fmt(s.amount)} (${(s.frac * 100).toFixed(1)}%)`}</title>
          </circle>
        ))}
        <text x={cx} y={cy - 3} textAnchor="middle" fontSize={10} fill="#64748b">
          {th('collected')}
        </text>
        <text x={cx} y={cy + 13} textAnchor="middle" fontSize={14} fontWeight={700} fill="#0f172a">
          {compact} {currency}
        </text>
      </svg>
      <ul className="w-full max-w-sm space-y-2.5">
        {segs.map((s, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
            <span className="flex-1 truncate text-slate-700">{tm(s.method)}</span>
            <span className="font-medium tabular-nums text-slate-900">{fmt(s.amount)}</span>
            <span className="w-12 text-end tabular-nums text-slate-500">
              {(s.frac * 100).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
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

  // Taux de recouvrement : encaissé / dû. Null quand rien n'est dû sur la
  // période — afficher 0 % laisserait croire à un échec de recouvrement là où
  // il n'y avait simplement rien à recouvrer.
  const rateArr = dueArr.map((d, i) => rateOf(collArr[i] ?? 0, d));
  const cumulRateArr = cumulDue.map((d, i) => rateOf(cumulColl[i] ?? 0, d));

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
        {/* Deux blocs : la période, puis le cumul. Alterner les deux comme
            avant obligeait à sauter une ligne sur deux pour suivre une série,
            et les trois « Cumul » se ressemblaient sans qu'on sache de quoi. */}
        <tbody className="divide-y divide-slate-100">
          <SeriesRow dot="bg-blue-500" label={t('due')} values={dueArr} total={sum(dueArr)} fmt={fmt} />
          <SeriesRow dot="bg-gray-400" label={t('collected')} values={collArr} total={sum(collArr)} fmt={fmt} />
          <SeriesRow dot="bg-orange-500" label={t('unpaid')} values={unpaidArr} total={sum(unpaidArr)} fmt={fmt} />
          <RateRow
            label={t('rate')}
            values={rateArr}
            total={rateOf(sum(collArr), sum(dueArr))}
          />

          <CumulRow tint="bg-blue-50 text-blue-700" label={t('cumulDue')} values={cumulDue} total={last(cumulDue)} fmt={fmt} />
          <CumulRow tint="bg-slate-100 text-slate-700" label={t('cumulCollected')} values={cumulColl} total={last(cumulColl)} fmt={fmt} />
          <CumulRow tint="bg-orange-50 text-orange-700" label={t('cumulUnpaid')} values={cumulUnpaid} total={last(cumulUnpaid)} fmt={fmt} />
          <RateRow
            label={t('cumulRate')}
            tint="bg-emerald-50 text-emerald-700"
            values={cumulRateArr}
            total={rateOf(last(cumulColl), last(cumulDue))}
          />
        </tbody>
      </table>
    </div>
  );
}

/** Taux de recouvrement, ou null si le dénominateur est nul. */
function rateOf(collected: number, due: number): number | null {
  return due > 0 ? Math.round((collected / due) * 1000) / 10 : null;
}

function RateRow({
  label,
  values,
  total,
  tint,
}: {
  label: string;
  values: Array<number | null>;
  total: number | null;
  tint?: string;
}) {
  const cell = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)} %`);
  return (
    <tr className={tint ?? 'bg-emerald-50/50'}>
      <td className="px-2 py-1.5 font-semibold text-emerald-800">{label}</td>
      {values.map((v, i) => (
        <td
          key={i}
          className={`px-2 py-1.5 text-end font-medium tabular-nums ${
            v === null ? 'text-slate-300' : 'text-emerald-800'
          }`}
        >
          {cell(v)}
        </td>
      ))}
      <td className="px-2 py-1.5 text-end font-bold tabular-nums text-emerald-900">{cell(total)}</td>
    </tr>
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
