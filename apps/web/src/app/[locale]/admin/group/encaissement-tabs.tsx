'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { SeriesChart, type ChartSeries } from '@/components/charts/series-chart';

export type RecoverySite = {
  name: string;
  color: string;
  /** Cumul encaissé à la fin de chaque mois. */
  collected: number[];
  /** Reste échu non encaissé à la fin de chaque mois. */
  remaining: number[];
  /** Taux de recouvrement cumulé du site, en %. */
  rate: (number | null)[];
};

type TabKey = 'amounts' | 'rate';

/** Gris commun au « reste à recouvrer », quel que soit l'établissement. */
const REMAINING = '#cbd5e1';
/** Couleur du consolidé — distincte de la palette des établissements. */
const TOTAL = '#0f172a';

/**
 * Bloc « Encaissement » de la vue groupe.
 *
 * Deux onglets plutôt qu'un graphique unique : montants et taux n'ont pas la
 * même échelle, et les mélanger obligeait à normaliser les montants en
 * pourcentage — lisible seulement avec une note explicative. Séparés, chaque
 * axe porte sa propre unité et se lit directement.
 */
export function EncaissementTabs({
  labels,
  total,
  sites,
  totalRate,
  currency,
  locale,
}: {
  labels: string[];
  total: { collected: number[]; remaining: number[] };
  sites: RecoverySite[];
  totalRate: (number | null)[];
  currency: string;
  locale: string;
}) {
  const t = useTranslations('admin.group.recovery');
  const [tab, setTab] = useState<TabKey>('amounts');

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'amounts', label: t('tabAmounts') },
    { key: 'rate', label: t('tabRate') },
  ];

  // Axe compact (12k, 1,2M) ; valeur exacte au survol.
  const axis = (v: number) =>
    v >= 1_000_000
      ? `${(v / 1_000_000).toFixed(1)}M`
      : v >= 1000
        ? `${Math.round(v / 1000)}k`
        : String(Math.round(v));
  const exact = (v: number) => `${Math.round(v).toLocaleString(locale)} ${currency}`;
  const pct = (v: number) => `${v.toFixed(0)}%`;
  const pctExact = (v: number) => `${v.toFixed(1)}%`;

  // Une pile pour le consolidé, puis une pile par établissement : sur trois
  // sites, cela fait bien quatre barres par mois.
  const amountSeries: ChartSeries[] = [
    { key: 'total-c', name: t('totalCollected'), color: TOTAL, stack: 'total', values: total.collected },
    { key: 'total-r', name: t('totalRemaining'), color: REMAINING, stack: 'total', values: total.remaining },
    ...sites.flatMap((s): ChartSeries[] => [
      { key: `${s.name}-c`, name: `${s.name} · ${t('collected')}`, color: s.color, stack: s.name, values: s.collected },
      { key: `${s.name}-r`, name: `${s.name} · ${t('remaining')}`, color: REMAINING, stack: s.name, values: s.remaining },
    ]),
  ];

  const rateSeries: ChartSeries[] = [
    { key: 'total', name: t('totalRate'), color: TOTAL, type: 'line', values: totalRate },
    ...sites.map((s): ChartSeries => ({
      key: s.name,
      name: s.name,
      color: s.color,
      type: 'line',
      values: s.rate,
    })),
  ];

  return (
    <section className="rounded-2xl border border-brand-200 bg-white p-5">
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

      <div className="mt-4">
        {tab === 'amounts' ? (
          <SeriesChart
            labels={labels}
            series={amountSeries}
            format={axis}
            formatValue={exact}
            emptyLabel={t('empty')}
          />
        ) : (
          <SeriesChart
            labels={labels}
            series={rateSeries}
            format={pct}
            formatValue={pctExact}
            yMax={100}
            emptyLabel={t('empty')}
          />
        )}
      </div>
    </section>
  );
}
