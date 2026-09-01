'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { SeriesChart, type ChartSeries } from '@/components/charts/series-chart';

export type MonthlySeries = {
  present: number[];
  absJustified: number[];
  absUnjustified: number[];
  absenceRate: (number | null)[];
};

export type TopRow = {
  studentId: string;
  name: string;
  levelLabel: string;
  className: string;
  count: number;
};

type TabKey = 'board' | 'month' | 'year' | 'abs' | 'rate' | 'topAbs' | 'topLate';

const TAB_KEYS: TabKey[] = ['board', 'month', 'year', 'abs', 'rate', 'topAbs', 'topLate'];

const C = { present: '#1baf7a', absJust: '#eda100', absUnjust: '#e0492f' };

/**
 * Onglets de la page Présence/Absences, sur le modèle du bloc « Évolution et
 * répartition » de Finances.
 *
 * Le tableau de bord journalier reste l'onglet par défaut : c'est l'écran de
 * travail quotidien de la vie scolaire ; les évolutions et les palmarès sont
 * des vues d'analyse, consultées ponctuellement.
 */
export function JourneeTabs({
  initialTab,
  board,
  monthView,
  yearView,
  labels,
  monthly,
  topAbsences,
  topLates,
}: {
  /** Onglet ouvert au chargement, repris de l'URL (`?tab=`). */
  initialTab?: string;
  board: React.ReactNode;
  /** Grilles agrégées, rendues côté serveur puis passées en enfants. */
  monthView: React.ReactNode;
  yearView: React.ReactNode;
  labels: string[];
  monthly: MonthlySeries;
  topAbsences: TopRow[];
  topLates: TopRow[];
}) {
  const t = useTranslations('admin.group.attendanceBlock');
  const tb = useTranslations('admin.vieScolaire.board');
  const [tab, setTab] = useState<TabKey>(
    TAB_KEYS.includes(initialTab as TabKey) ? (initialTab as TabKey) : 'board',
  );

  // Les vues mensuelle/annuelle rechargent la page via leur propre formulaire :
  // on garde l'onglet courant dans l'URL pour y revenir après le submit.
  const selectTab = (key: TabKey) => {
    setTab(key);
    const url = new URL(window.location.href);
    if (key === 'board') url.searchParams.delete('tab');
    else url.searchParams.set('tab', key);
    window.history.replaceState(null, '', url.toString());
  };

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'board', label: tb('title') },
    { key: 'month', label: tb('tabMonth') },
    { key: 'year', label: tb('tabYear') },
    { key: 'abs', label: t('tabAbs') },
    { key: 'rate', label: t('tabRate') },
    { key: 'topAbs', label: t('tabTopAbs') },
    { key: 'topLate', label: t('tabTopLate') },
  ];

  const intFmt = (v: number) => Math.round(v).toLocaleString();
  const pctFmt = (v: number) => `${v.toFixed(0)}%`;

  const absSeries: ChartSeries[] = [
    { key: 'present', name: t('present'), color: C.present, stack: 'all', values: monthly.present },
    { key: 'absJust', name: t('absJustified'), color: C.absJust, stack: 'all', values: monthly.absJustified },
    { key: 'absUnjust', name: t('absUnjustified'), color: C.absUnjust, stack: 'all', values: monthly.absUnjustified },
  ];
  const rateSeries: ChartSeries[] = [
    { key: 'rate', name: t('absenceRate'), color: C.absUnjust, values: monthly.absenceRate },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
        {tabs.map((x) => (
          <button
            key={x.key}
            type="button"
            onClick={() => selectTab(x.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === x.key
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {x.label}
          </button>
        ))}
      </div>

      {/* Le tableau de bord reste monté : le remonter à chaque aller-retour
          coûterait un rechargement complet de ses blocs. */}
      <div className={tab === 'board' ? '' : 'hidden'}>{board}</div>
      {/* Montées en permanence comme le journalier : elles portent leurs
          propres sélecteurs, qui rechargent la page. */}
      <div className={tab === 'month' ? '' : 'hidden'}>{monthView}</div>
      <div className={tab === 'year' ? '' : 'hidden'}>{yearView}</div>

      {tab === 'abs' && (
        <section className="rounded-2xl border border-brand-200 bg-white p-5">
          <SeriesChart labels={labels} series={absSeries} format={intFmt} emptyLabel={t('empty')} />
        </section>
      )}
      {tab === 'rate' && (
        <section className="rounded-2xl border border-brand-200 bg-white p-5">
          <SeriesChart labels={labels} series={rateSeries} format={pctFmt} yMax={100} emptyLabel={t('empty')} />
        </section>
      )}
      {(tab === 'topAbs' || tab === 'topLate') && (
        <section className="overflow-x-auto rounded-2xl border border-brand-200 bg-white p-5">
          <TopTable
            rows={tab === 'topAbs' ? topAbsences : topLates}
            countLabel={tab === 'topAbs' ? t('absences') : t('lates')}
          />
        </section>
      )}
    </div>
  );
}

function TopTable({ rows, countLabel }: { rows: TopRow[]; countLabel: string }) {
  const t = useTranslations('admin.group.attendanceBlock');
  return (
    <table className="w-full min-w-[520px] text-sm">
      <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
        <tr>
          <th className="px-3 py-2 text-start">#</th>
          <th className="px-3 py-2 text-start">{t('student')}</th>
          <th className="px-3 py-2 text-start">{t('level')}</th>
          <th className="px-3 py-2 text-start">{t('class')}</th>
          <th className="px-3 py-2 text-end">{countLabel}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((r, i) => (
          <tr key={r.studentId}>
            <td className="px-3 py-2 text-xs tabular-nums text-slate-400">{i + 1}</td>
            <td className="px-3 py-2 font-medium text-slate-800">{r.name}</td>
            <td className="px-3 py-2 text-xs text-slate-600">{r.levelLabel}</td>
            <td className="px-3 py-2 text-xs text-slate-600">{r.className}</td>
            <td className="px-3 py-2 text-end font-semibold tabular-nums text-slate-900">{r.count}</td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td colSpan={5} className="px-3 py-8 text-center text-xs text-slate-400">
              {t('empty')}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
