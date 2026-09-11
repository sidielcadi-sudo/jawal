'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { notifyParentAction } from './actions';

/**
 * Bouton « Prévenir les parents » d'une ligne du détail.
 *
 * L'envoi est réel : il part vers les contacts de l'élève et se journalise.
 * L'issue est donc affichée sur place — « pas d'adresse » et « échec d'envoi »
 * sont des réponses utiles, un bouton qui redevient simplement cliquable ne
 * dirait pas si la famille a été prévenue.
 */
export function NotifyButton({ recordId, label }: { recordId: string; label: string }) {
  const t = useTranslations('admin.attendanceIndex.detail');
  const [pending, start] = useTransition();
  const [state, setState] = useState<'idle' | 'done' | 'no-recipient' | 'error'>('idle');

  const title =
    state === 'done'
      ? t('notifyDone')
      : state === 'no-recipient'
        ? t('noContact')
        : state === 'error'
          ? t('failed')
          : label;

  const tone =
    state === 'done'
      ? 'text-emerald-600'
      : state === 'idle'
        ? 'text-slate-500 hover:bg-slate-100 hover:text-brand-700'
        : 'text-red-600';

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={pending || state === 'done'}
      onClick={() =>
        start(async () => {
          const res = await notifyParentAction(recordId);
          if (res.ok) setState('done');
          else setState(res.error === 'no-recipient' ? 'no-recipient' : 'error');
        })
      }
      className={`grid h-7 w-7 place-items-center rounded-lg disabled:opacity-60 ${tone}`}
    >
      {pending ? '…' : state === 'done' ? '✓' : '➤'}
    </button>
  );
}
