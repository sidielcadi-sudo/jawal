'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { duplicateFeesToNextYearAction } from './actions';

/**
 * Reconduction de la grille tarifaire d'un cycle sur l'année suivante.
 *
 * Le geste est confirmé avant exécution : il crée des dizaines de lignes
 * tarifaires d'un coup, et les défaire une par une serait pénible.
 */
export function DuplicateFeesButton({
  cycleId,
  sourceYearId,
  sourceYearLabel,
  feeCount,
}: {
  cycleId: string;
  sourceYearId: string;
  sourceYearLabel: string;
  feeCount: number;
}) {
  const t = useTranslations('admin.settings.fees.duplicate');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  function run() {
    setError('');
    setMsg('');
    start(async () => {
      const r = await duplicateFeesToNextYearAction(cycleId, sourceYearId);
      if (!r.ok) {
        setError(r.error);
        setConfirming(false);
        return;
      }
      setConfirming(false);
      setMsg(
        t('done', {
          created: r.data?.created ?? 0,
          skipped: r.data?.skipped ?? 0,
          year: r.data?.targetYear ?? '',
        }),
      );
      router.refresh();
    });
  }

  if (feeCount === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-lg border border-brand-300 bg-white px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
        >
          ⧉ {t('action', { count: feeCount })}
        </button>
      ) : (
        <>
          <span className="text-xs text-amber-800">
            {t('confirm', { count: feeCount, year: sourceYearLabel })}
          </span>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={run}
            className="rounded-lg bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {pending ? t('running') : t('confirmAction')}
          </button>
        </>
      )}
      {msg && <span className="text-xs text-emerald-700">{msg}</span>}
      {error && <span className="text-xs text-red-700">{error}</span>}
    </div>
  );
}
