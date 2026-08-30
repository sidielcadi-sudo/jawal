'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { SeriesChart, type ChartSeries } from '@/components/charts/series-chart';

export type SiteAttendance = {
  name: string;
  color: string;
  present: number[];
  absJustified: number[];
  absUnjustified: number[];
  lateJustified: number[];
  lateUnjustified: number[];
  absenceRate: (number | null)[];
};

export type TopRow = {
  studentId: string;
  name: string;
  levelLabel: string;
  className: string;
  count: number;
  siteName: string;
};

type TabKey =
  | 'abs'
  | 'absSite'
  | 'late'
  | 'lateSite'
  | 'rate'
  | 'rateSite'
  | 'topAbs'
  | 'topLate';

/** Teintes des catégories, communes à tous les onglets. */
const C = {
  present: '#1baf7a',
  absJust: '#eda100',
  absUnjust: '#e0492f',
  lateJust: '#7aa7d9',
  lateUnjust: '#4a3aa7',
};

/**
 * Bloc « Présence / Absence » de la vue groupe, sur le modèle des onglets de
 * Finances › Revenus & encaissements.
 *
 * Deux familles d'onglets : la vue consolidée (somme des établissements) et la
 * vue par établissement, où chaque établissement forme sa propre pile dans le
 * créneau du mois. Les légendes sont cliquables — c'est le seul moyen de lire
 * une pile à six ou sept séries.
 */
export function AttendanceTabs({
  labels,
  sites,
  topAbsences,
  topLates,
}: {
  labels: string[];
  sites: SiteAttendance[];
  topAbsences: TopRow[];
  topLates: TopRow[];
}) {
  const t = useTranslations('admin.group.attendanceBlock');
  const [tab, setTab] = useState<TabKey>('abs');

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'abs', label: t('tabAbs') },
    { key: 'absSite', label: t('tabAbsSite') },
    { key: 'late', label: t('tabLate') },
    { key: 'lateSite', label: t('tabLateSite') },
    { key: 'rate', label: t('tabRate') },
    { key: 'rateSite', label: t('tabRateSite') },
    { key: 'topAbs', label: t('tabTopAbs') },
    { key: 'topLate', label: t('tabTopLate') },
  ];

  const n = labels.length;
  const sum = (pick: (s: SiteAttendance) => number[]) =>
    Array.from({ length: n }, (_, i) => sites.reduce((acc, s) => acc + (pick(s)[i] ?? 0), 0));

  // Taux consolidé : rapport des sommes, pas moyenne des taux — un petit site
  // ne doit pas peser autant qu'un grand.
  const consolidatedRate = Array.from({ length: n }, (_, i) => {
    let abs = 0;
    let total = 0;
    for (const s of sites) {
      const a = (s.absJustified[i] ?? 0) + (s.absUnjustified[i] ?? 0);
      abs += a;
      total += a + (s.present[i] ?? 0);
    }
    return total > 0 ? (abs / total) * 100 : null;
  });

  const intFmt = (v: number) => Math.round(v).toLocaleString();
  const pctFmt = (v: number) => `${v.toFixed(0)}%`;

  let content: React.ReactNode;

  if (tab === 'abs') {
    const series: ChartSeries[] = [
      { key: 'present', name: t('present'), color: C.present, stack: 'all', values: sum((s) => s.present) },
      { key: 'absJust', name: t('absJustified'), color: C.absJust, stack: 'all', values: sum((s) => s.absJustified) },
      { key: 'absUnjust', name: t('absUnjustified'), color: C.absUnjust, stack: 'all', values: sum((s) => s.absUnjustified) },
    ];
    content = <SeriesChart labels={labels} series={series} format={intFmt} emptyLabel={t('empty')} />;
  } else if (tab === 'absSite') {
    const series: ChartSeries[] = sites.flatMap((s) => [
      { key: `${s.name}-p`, name: `${s.name} · ${t('present')}`, color: C.present, stack: s.name, values: s.present },
      { key: `${s.name}-aj`, name: `${s.name} · ${t('absJustified')}`, color: C.absJust, stack: s.name, values: s.absJustified },
      { key: `${s.name}-au`, name: `${s.name} · ${t('absUnjustified')}`, color: C.absUnjust, stack: s.name, values: s.absUnjustified },
    ]);
    content = <SeriesChart labels={labels} series={series} format={intFmt} emptyLabel={t('empty')} />;
  } else if (tab === 'late') {
    const series: ChartSeries[] = [
      { key: 'lateJust', name: t('lateJustified'), color: C.lateJust, stack: 'all', values: sum((s) => s.lateJustified) },
      { key: 'lateUnjust', name: t('lateUnjustified'), color: C.lateUnjust, stack: 'all', values: sum((s) => s.lateUnjustified) },
    ];
    content = <SeriesChart labels={labels} series={series} format={intFmt} emptyLabel={t('empty')} />;
  } else if (tab === 'lateSite') {
    const series: ChartSeries[] = sites.flatMap((s) => [
      { key: `${s.name}-lj`, name: `${s.name} · ${t('lateJustified')}`, color: C.lateJust, stack: s.name, values: s.lateJustified },
      { key: `${s.name}-lu`, name: `${s.name} · ${t('lateUnjustified')}`, color: C.lateUnjust, stack: s.name, values: s.lateUnjustified },
    ]);
    content = <SeriesChart labels={labels} series={series} format={intFmt} emptyLabel={t('empty')} />;
  } else if (tab === 'rate') {
    const series: ChartSeries[] = [
      { key: 'rate', name: t('absenceRate'), color: C.absUnjust, values: consolidatedRate },
    ];
    content = <SeriesChart labels={labels} series={series} format={pctFmt} yMax={100} emptyLabel={t('empty')} />;
  } else if (tab === 'rateSite') {
    const series: ChartSeries[] = sites.map((s) => ({
      key: s.name,
      name: s.name,
      color: s.color,
      values: s.absenceRate,
    }));
    content = <SeriesChart labels={labels} series={series} format={pctFmt} yMax={100} emptyLabel={t('empty')} />;
  } else {
    content = <TopTable rows={tab === 'topAbs' ? topAbsences : topLates} countLabel={tab === 'topAbs' ? t('absences') : t('lates')} />;
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

function TopTable({ rows, countLabel }: { rows: TopRow[]; countLabel: string }) {
  const t = useTranslations('admin.group.attendanceBlock');
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2 text-start">#</th>
            <th className="px-3 py-2 text-start">{t('student')}</th>
            <th className="px-3 py-2 text-start">{t('site')}</th>
            <th className="px-3 py-2 text-start">{t('level')}</th>
            <th className="px-3 py-2 text-start">{t('class')}</th>
            <th className="px-3 py-2 text-end">{countLabel}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <tr key={`${r.studentId}-${i}`}>
              <td className="px-3 py-2 text-xs tabular-nums text-slate-400">{i + 1}</td>
              <td className="px-3 py-2 font-medium text-slate-800">{r.name}</td>
              <td className="px-3 py-2 text-xs text-slate-500">{r.siteName}</td>
              <td className="px-3 py-2 text-xs text-slate-600">{r.levelLabel}</td>
              <td className="px-3 py-2 text-xs text-slate-600">{r.className}</td>
              <td className="px-3 py-2 text-end font-semibold tabular-nums text-slate-900">{r.count}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-8 text-center text-xs text-slate-400">
                {t('empty')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
