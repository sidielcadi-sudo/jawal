'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { setContentiousAction } from './contentious-actions';

/** Bascule « contentieux » des échéances échues d'un élève. */
export function ContentiousButton({ installmentIds, active }: { installmentIds: string[]; active: boolean }) {
  const t = useTranslations('admin.finance.unpaid.contentious');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  if (installmentIds.length === 0) return null;

  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={pending}
        title={active ? t('offHint') : t('onHint')}
        onClick={() =>
          start(async () => {
            setError('');
            const r = await setContentiousAction(installmentIds, !active);
            if (!r.ok) return setError(r.error);
            router.refresh();
          })
        }
        className={`rounded-lg border px-2 py-1 text-xs font-medium disabled:opacity-50 ${
          active
            ? 'border-purple-300 bg-purple-50 text-purple-800 hover:bg-purple-100'
            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
        }`}
      >
        ⚖ {active ? t('off') : t('on')}
      </button>
      {error && <span className="mt-0.5 text-[10px] text-red-700">{error}</span>}
    </span>
  );
}
