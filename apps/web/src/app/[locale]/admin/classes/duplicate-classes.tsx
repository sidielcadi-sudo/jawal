'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { duplicateClassesAction } from './actions';

type YearOpt = { id: string; label: string; active: boolean };

/**
 * « Dupliquer classes » : recopie la structure des classes d'une année
 * précédente sur l'année active, en coquilles vides.
 *
 * Le bouton ouvre une petite fenêtre plutôt que d'agir au clic : l'opération
 * crée des dizaines de classes d'un coup, elle mérite qu'on choisisse l'année
 * source et qu'on lise ce qui va être repris.
 */
export function DuplicateClassesButton({
  years,
  activeYear,
}: {
  years: YearOpt[];
  activeYear: { id: string; label: string } | null;
}) {
  const t = useTranslations('admin.classes.duplicate');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [sourceYearId, setSourceYearId] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ created: number; skipped: number } | null>(null);

  // Une duplication va forcément d'une autre année vers l'année active.
  const sources = years.filter((y) => y.id !== activeYear?.id);

  function run() {
    setError('');
    setDone(null);
    if (!sourceYearId) {
      setError(t('selectSource'));
      return;
    }
    start(async () => {
      const res = await duplicateClassesAction(sourceYearId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone({ created: res.data!.created, skipped: res.data!.skipped });
      router.refresh();
    });
  }

  if (!activeYear) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-emerald-700"
      >
        {t('button')}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-start shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900">{t('title')}</h3>
            <p className="mt-1 text-sm text-slate-500">
              {t('subtitle', { year: activeYear.label })}
            </p>

            <label className="mt-4 block text-xs font-medium uppercase text-slate-500">
              {t('sourceYear')}
            </label>
            <select
              value={sourceYearId}
              onChange={(e) => setSourceYearId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">—</option>
              {sources.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.label}
                </option>
              ))}
            </select>

            <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {t('copied')}
            </p>

            {error && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}
            {done && (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                {t('result', { created: done.created, skipped: done.skipped })}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                {done ? t('close') : t('cancel')}
              </button>
              <button
                type="button"
                onClick={run}
                disabled={pending}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-emerald-700 disabled:opacity-50"
              >
                {pending ? t('running') : t('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
