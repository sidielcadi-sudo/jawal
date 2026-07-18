'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

type Opt = { id: string; label: string };

const YEAR_TYPES = ['CERTIFICAT_SCOLARITE', 'ATTESTATION_PAIEMENT'] as const;
const PERIOD_TYPES = ['ATTESTATION_PRESENCE', 'ATTESTATION_REUSSITE'] as const;

/**
 * Panneau de génération des documents officiels (PDF). Générique : `hrefBase`
 * pointe vers la route admin ou parent, qui partage le même contrat de query.
 */
export function DocumentsPanel({
  hrefBase,
  years,
  periods,
  defaultPeriodId,
}: {
  hrefBase: string;
  years: Opt[];
  periods: Opt[];
  /** Trimestre présélectionné (par défaut le trimestre en cours). */
  defaultPeriodId?: string;
}) {
  const t = useTranslations('admin.documents');
  const [year, setYear] = useState(years[0]?.id ?? '');
  const [period, setPeriod] = useState(defaultPeriodId ?? periods[0]?.id ?? '');

  const selectCls = 'mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm shadow-sm';
  const btnCls =
    'rounded-lg border border-brand-600 bg-white px-3 py-1.5 text-xs font-medium text-brand-700 shadow-sm hover:bg-brand-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400';

  const yearHref = (type: string) => `${hrefBase}?type=${type}&year=${year}`;
  const periodHref = (type: string) => `${hrefBase}?type=${type}&period=${period}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <label className="block text-sm">
          <span className="block text-xs text-slate-500">{t('fields.year')}</span>
          <select value={year} onChange={(e) => setYear(e.target.value)} className={selectCls}>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="block text-xs text-slate-500">{t('fields.period')}</span>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            disabled={periods.length === 0}
            className={selectCls}
          >
            {periods.length === 0 && <option value="">—</option>}
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        {YEAR_TYPES.map((type) => (
          <a key={type} href={yearHref(type)} target="_blank" rel="noopener" className={btnCls}>
            ⬇ {t(`types.${type}`)}
          </a>
        ))}
        {PERIOD_TYPES.map((type) =>
          period ? (
            <a key={type} href={periodHref(type)} target="_blank" rel="noopener" className={btnCls}>
              ⬇ {t(`types.${type}`)}
            </a>
          ) : (
            <button key={type} type="button" disabled className={btnCls} title={t('needPeriod')}>
              ⬇ {t(`types.${type}`)}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
