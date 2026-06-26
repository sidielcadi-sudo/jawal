'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { setFeeConsentAction } from './fees-actions';

export function FeeConsentButtons({ assignmentId }: { assignmentId: string }) {
  const t = useTranslations('parent.child.exceptionalFees');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');

  function decide(decision: 'ACCEPT' | 'REFUSE') {
    setError('');
    const fd = new FormData();
    fd.set('assignmentId', assignmentId);
    fd.set('decision', decision);
    start(async () => {
      const r = await setFeeConsentAction(fd);
      if (!r.ok) setError(r.error ?? 'Erreur');
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => decide('ACCEPT')}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {t('accept')}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => decide('REFUSE')}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {t('refuse')}
        </button>
      </div>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
