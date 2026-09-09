'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { importFrameworkFromYearAction } from './actions';

export type FrameworkCandidate = {
  id: string;
  label: string;
  yearLabel: string;
  nodeCount: number;
};

/**
 * Reprise d'un référentiel d'une année précédente.
 *
 * Un établissement ne réécrit pas son référentiel de compétences chaque
 * rentrée : il reconduit celui de l'année passée puis l'ajuste. Sans ce geste,
 * l'écran restait vide et la seule issue était de tout ressaisir.
 */
export function ImportFrameworkPanel({
  candidates,
  activeYearLabel,
}: {
  candidates: FrameworkCandidate[];
  activeYearLabel: string;
}) {
  const t = useTranslations('admin.competences.import');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [selected, setSelected] = useState(candidates[0]?.id ?? '');

  function run() {
    setError('');
    setDone('');
    start(async () => {
      const r = await importFrameworkFromYearAction(selected);
      if (!r.ok) return setError(r.error);
      setDone(t('done', { nodes: r.data?.nodes ?? 0, levels: r.data?.levels ?? 0 }));
      router.refresh();
    });
  }

  if (candidates.length === 0) {
    return <p className="mt-2 text-sm text-slate-400">{t('noSource')}</p>;
  }

  return (
    <div className="mx-auto mt-5 max-w-xl rounded-2xl border border-brand-200 bg-white p-5 text-start">
      <h3 className="text-sm font-semibold text-slate-900">{t('title')}</h3>
      <p className="mt-1 text-xs text-slate-500">{t('hint', { year: activeYearLabel })}</p>

      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      >
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.yearLabel} — {c.label} ({t('nodes', { count: c.nodeCount })})
          </option>
        ))}
      </select>

      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      {done && <p className="mt-2 text-xs text-emerald-700">{done}</p>}

      <button
        type="button"
        disabled={pending || !selected}
        onClick={run}
        className="mt-3 w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {pending ? t('running') : t('action', { year: activeYearLabel })}
      </button>

      <p className="mt-2 text-[11px] text-slate-400">{t('safeNote')}</p>
    </div>
  );
}
