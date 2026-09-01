'use client';

import { useTranslations } from 'next-intl';

/**
 * Colonnes affichées. Redéclarées ici plutôt qu'importées de
 * `vie-scolaire-board` : ce module est marqué `server-only` et ne peut pas
 * entrer dans un composant client.
 *
 * « Appels non faits » est volontairement absente — elle n'est pas calculée à
 * la maille mois/année.
 */
const SHOWN_COLS = [
  'absRA',
  'absNonRA',
  'retards',
  'exclCours',
  'incidents',
  'infirmerie',
  'presents',
] as const;
type ShownCol = (typeof SHOWN_COLS)[number];

export type PeriodRow = {
  key: string;
  label: string;
  counts: Record<ShownCol, number>;
};

/**
 * Grille agrégée du tableau de bord, en vue mensuelle ou annuelle.
 *
 * Même jeu de colonnes que la vue journalière ; seule la première change de
 * sens — elle porte les jours du mois, ou les mois de l'année, au lieu des
 * créneaux horaires.
 */
export function PeriodBoard({
  rows,
  totals,
  firstColLabel,
}: {
  rows: PeriodRow[];
  totals: Record<ShownCol, number>;
  firstColLabel: string;
}) {
  const t = useTranslations('admin.vieScolaire.board');

  return (
    <div className="overflow-x-auto rounded-2xl border border-brand-200 bg-white">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
          <tr>
            <th className="px-3 py-2.5 text-start">{firstColLabel}</th>
            {SHOWN_COLS.map((c) => (
              <th key={c} className="px-3 py-2.5 text-end">
                {t(`cols.${c}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => {
            const empty = SHOWN_COLS.every((c) => r.counts[c] === 0);
            return (
              <tr key={r.key} className={empty ? 'text-slate-300' : ''}>
                <td className="whitespace-nowrap px-3 py-2 font-medium capitalize text-slate-700">
                  {r.label}
                </td>
                {SHOWN_COLS.map((c) => (
                  <td key={c} className="px-3 py-2 text-end tabular-nums">
                    {r.counts[c] || <span className="text-slate-300">—</span>}
                  </td>
                ))}
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={SHOWN_COLS.length + 1} className="px-3 py-8 text-center text-slate-400">
                {t('empty')}
              </td>
            </tr>
          )}
        </tbody>
        <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900">
          <tr>
            <td className="px-3 py-2.5">{t('total')}</td>
            {SHOWN_COLS.map((c) => (
              <td key={c} className="px-3 py-2.5 text-end tabular-nums">
                {totals[c]}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
