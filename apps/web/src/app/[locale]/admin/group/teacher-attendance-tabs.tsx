'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { SeriesChart, type ChartSeries } from '@/components/charts/series-chart';

export type SiteTeacherAttendance = {
  name: string;
  color: string;
  presenceRate: number | null;
  absenceRate: number | null;
  absentDays: number;
  longAbsenceDays: number;
  shortAbsenceDays: number;
  monthly: {
    absences: number[];
    longAbsences: number[];
    shortAbsences: number[];
    absenceRate: (number | null)[];
  };
  byReason: { label: string; color: string; days: number }[];
  byWeekday: number[];
  atRisk: {
    personId: string;
    name: string;
    absencesThisMonth: number;
    totalDays: number;
    reasons: string[];
  }[];
};

type TabKey = 'overview' | 'trend' | 'reasons' | 'sites' | 'weekday' | 'alerts';

const C = { long: '#4a3aa7', short: '#7aa7d9', absence: '#e0492f' };

/** Repère national : ~5,5 % d'enseignants absents sur une semaine ordinaire. */
const NATIONAL_ABSENCE_RATE = 5.5;

/**
 * Bloc « Suivi présence des professeurs » de la vue groupe.
 *
 * Ne présente que ce que le pointage journalier permet de calculer
 * honnêtement : taux de présence et d'absence, partage long/court, motifs,
 * répartition par jour et par établissement, et les alertes individuelles.
 *
 * Les heures de cours perdues et le taux de remplacement n'y figurent pas :
 * ils supposent de relier une absence aux créneaux d'emploi du temps concernés,
 * ce que le modèle ne fait pas encore.
 */
export function TeacherAttendanceTabs({
  labels,
  sites,
  weekdayLabels,
}: {
  labels: string[];
  sites: SiteTeacherAttendance[];
  weekdayLabels: string[];
}) {
  const t = useTranslations('admin.group.teacherAttendance');
  const [tab, setTab] = useState<TabKey>('overview');

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'overview', label: t('tabOverview') },
    { key: 'trend', label: t('tabTrend') },
    { key: 'reasons', label: t('tabReasons') },
    { key: 'sites', label: t('tabSites') },
    { key: 'weekday', label: t('tabWeekday') },
    { key: 'alerts', label: t('tabAlerts') },
  ];

  const n = labels.length;
  const sum = (pick: (s: SiteTeacherAttendance) => number[]) =>
    Array.from({ length: n }, (_, i) => sites.reduce((a, s) => a + (pick(s)[i] ?? 0), 0));

  const totalAbsent = sites.reduce((a, s) => a + s.absentDays, 0);
  const totalLong = sites.reduce((a, s) => a + s.longAbsenceDays, 0);
  const totalShort = sites.reduce((a, s) => a + s.shortAbsenceDays, 0);
  // Taux consolidé : rapport des sommes, pas moyenne des taux par site.
  const totalDays = sites.reduce(
    (a, s) => a + (s.absenceRate !== null && s.absenceRate > 0 ? s.absentDays / (s.absenceRate / 100) : 0),
    0,
  );
  const absenceRate = totalDays > 0 ? (totalAbsent / totalDays) * 100 : null;
  const presenceRate = absenceRate === null ? null : 100 - absenceRate;

  const intFmt = (v: number) => Math.round(v).toLocaleString();
  const pctFmt = (v: number) => `${v.toFixed(0)}%`;
  const pct1 = (v: number) => `${v.toFixed(1)}%`;

  // Motifs consolidés tous établissements.
  const reasonMap = new Map<string, { label: string; color: string; days: number }>();
  for (const s of sites)
    for (const r of s.byReason) {
      const cur = reasonMap.get(r.label) ?? { label: r.label, color: r.color, days: 0 };
      cur.days += r.days;
      reasonMap.set(r.label, cur);
    }
  const reasons = [...reasonMap.values()].sort((a, b) => b.days - a.days);

  let content: React.ReactNode;

  if (tab === 'overview') {
    content = (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t('presenceRate')} value={presenceRate === null ? '—' : pct1(presenceRate)} tone="emerald" />
        <Kpi
          label={t('absenceRate')}
          value={absenceRate === null ? '—' : pct1(absenceRate)}
          tone={absenceRate !== null && absenceRate > NATIONAL_ABSENCE_RATE ? 'red' : 'emerald'}
          hint={t('nationalRef', { rate: NATIONAL_ABSENCE_RATE })}
        />
        <Kpi label={t('longAbsences')} value={String(totalLong)} tone="indigo" hint={t('longHint')} />
        <Kpi label={t('shortAbsences')} value={String(totalShort)} tone="sky" hint={t('shortHint')} />
      </div>
    );
  } else if (tab === 'trend') {
    const series: ChartSeries[] = [
      { key: 'long', name: t('longAbsences'), color: C.long, stack: 'all', values: sum((s) => s.monthly.longAbsences) },
      { key: 'short', name: t('shortAbsences'), color: C.short, stack: 'all', values: sum((s) => s.monthly.shortAbsences) },
    ];
    content = <SeriesChart labels={labels} series={series} format={intFmt} emptyLabel={t('empty')} />;
  } else if (tab === 'reasons') {
    content = <ReasonBreakdown reasons={reasons} total={totalAbsent} emptyLabel={t('empty')} daysLabel={t('days')} />;
  } else if (tab === 'sites') {
    const series: ChartSeries[] = sites.map((s) => ({
      key: s.name,
      name: s.name,
      color: s.color,
      type: 'line',
      values: s.monthly.absenceRate,
    }));
    content = <SeriesChart labels={labels} series={series} format={pctFmt} yMax={100} emptyLabel={t('empty')} />;
  } else if (tab === 'weekday') {
    const series: ChartSeries[] = [
      {
        key: 'weekday',
        name: t('absences'),
        color: C.absence,
        values: weekdayLabels.map((_, i) => sites.reduce((a, s) => a + (s.byWeekday[i] ?? 0), 0)),
      },
    ];
    content = <SeriesChart labels={weekdayLabels} series={series} format={intFmt} emptyLabel={t('empty')} />;
  } else {
    const rows = sites
      .flatMap((s) => s.atRisk.map((r) => ({ ...r, siteName: s.name })))
      .sort((a, b) => b.totalDays - a.totalDays);
    content = <AtRiskTable rows={rows} />;
  }

  return (
    <section className="mt-4 rounded-2xl border border-brand-200 bg-white p-5">
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
      <div className="mt-4">{content}</div>
    </section>
  );
}

const TONE: Record<string, string> = {
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  red: 'border-red-200 bg-red-50 text-red-800',
  indigo: 'border-indigo-200 bg-indigo-50 text-indigo-800',
  sky: 'border-sky-200 bg-sky-50 text-sky-800',
};

function Kpi({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: keyof typeof TONE;
  hint?: string;
}) {
  return (
    <div className={`rounded-xl border p-3 ${TONE[tone]}`}>
      <div className="text-[10px] font-medium uppercase leading-tight tracking-wide opacity-70">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-[10px] opacity-70">{hint}</div>}
    </div>
  );
}

/** Donut des motifs + répartition chiffrée à côté. */
function ReasonBreakdown({
  reasons,
  total,
  emptyLabel,
  daysLabel,
}: {
  reasons: { label: string; color: string; days: number }[];
  total: number;
  emptyLabel: string;
  daysLabel: string;
}) {
  if (total === 0 || reasons.length === 0) {
    return <p className="py-10 text-center text-sm text-slate-400">{emptyLabel}</p>;
  }
  const R = 70;
  const sw = 34;
  const c = 90;
  const circ = 2 * Math.PI * R;
  let offset = 0;
  const segs = reasons.map((r) => {
    const frac = r.days / total;
    const len = frac * circ;
    const seg = { ...r, frac, len, off: offset };
    offset -= len;
    return seg;
  });

  return (
    <div className="flex flex-col items-center gap-8 sm:flex-row">
      <svg viewBox="0 0 180 180" className="h-44 w-44 shrink-0" role="img">
        {segs.map((s, i) => (
          <circle
            key={i}
            cx={c}
            cy={c}
            r={R}
            fill="none"
            stroke={s.color}
            strokeWidth={sw}
            strokeDasharray={`${s.len} ${circ - s.len}`}
            strokeDashoffset={s.off}
            transform={`rotate(-90 ${c} ${c})`}
          >
            <title>{`${s.label} : ${s.days} ${daysLabel} (${(s.frac * 100).toFixed(1)}%)`}</title>
          </circle>
        ))}
        <text x={c} y={c + 5} textAnchor="middle" fontSize={16} fontWeight={700} fill="#0f172a">
          {total}
        </text>
      </svg>
      <ul className="w-full max-w-sm space-y-2.5">
        {segs.map((s, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
            <span className="flex-1 truncate text-slate-700">{s.label}</span>
            <span className="font-medium tabular-nums text-slate-900">{s.days}</span>
            <span className="w-12 text-end tabular-nums text-slate-500">
              {(s.frac * 100).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AtRiskTable({
  rows,
}: {
  rows: {
    personId: string;
    name: string;
    siteName: string;
    absencesThisMonth: number;
    totalDays: number;
    reasons: string[];
  }[];
}) {
  const t = useTranslations('admin.group.teacherAttendance');
  return (
    <div className="overflow-x-auto">
      <p className="mb-3 text-xs text-slate-500">{t('alertsHint')}</p>
      <table className="w-full min-w-[560px] text-sm">
        <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2 text-start">{t('teacher')}</th>
            <th className="px-3 py-2 text-start">{t('site')}</th>
            <th className="px-3 py-2 text-end">{t('thisMonth')}</th>
            <th className="px-3 py-2 text-end">{t('totalDays')}</th>
            <th className="px-3 py-2 text-start">{t('reasons')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.personId}>
              <td className="px-3 py-2 font-medium text-slate-800">{r.name}</td>
              <td className="px-3 py-2 text-xs text-slate-500">{r.siteName}</td>
              <td className="px-3 py-2 text-end tabular-nums">
                <span
                  className={
                    r.absencesThisMonth >= 3
                      ? 'rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-700'
                      : 'text-slate-600'
                  }
                >
                  {r.absencesThisMonth}
                </span>
              </td>
              <td className="px-3 py-2 text-end font-semibold tabular-nums text-slate-900">
                {r.totalDays}
              </td>
              <td className="px-3 py-2 text-xs text-slate-500">
                {r.reasons.length > 0 ? r.reasons.join(', ') : '—'}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-8 text-center text-xs text-slate-400">
                {t('noAlert')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
