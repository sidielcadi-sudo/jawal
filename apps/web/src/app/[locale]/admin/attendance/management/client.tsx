'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  confirmEventAction,
  justifyEventAction,
  cancelEventAction,
  convertEventAction,
  reviewParentJustificationAction,
} from './actions';

/** Accepter / refuser la justification déposée par le parent (refus → motif). */
export function JustifReview({ eventId }: { eventId: string }) {
  const t = useTranslations('admin.absenceMgmt');
  const router = useRouter();
  const [pending, start] = useTransition();

  function run(decision: 'APPROVED' | 'REJECTED', reviewNote?: string) {
    start(async () => {
      const r = await reviewParentJustificationAction(eventId, decision, reviewNote);
      if (r.ok) router.refresh();
      // eslint-disable-next-line no-alert
      else alert(r.error);
    });
  }

  return (
    <div className="flex gap-1.5 pt-0.5">
      <button
        type="button"
        disabled={pending}
        onClick={() => run('APPROVED')}
        className="rounded bg-emerald-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {t('justifAccept')}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          // eslint-disable-next-line no-alert
          const note = window.prompt(t('justifRejectPrompt'));
          if (note && note.trim().length >= 2) run('REJECTED', note.trim());
        }}
        className="rounded border border-red-300 px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        {t('justifReject')}
      </button>
    </div>
  );
}

export function EventRowActions({
  id,
  category,
  status,
}: {
  id: string;
  category: string;
  status: string;
}) {
  const t = useTranslations('admin.absenceMgmt');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError('');
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? 'Erreur');
      else router.refresh();
    });
  }

  const canConvert = category === 'ABSENCE' || category === 'RETARD';

  return (
    <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
      {error && <span className="text-red-700">{error}</span>}
      {status !== 'CONFIRMED' && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => confirmEventAction(id))}
          className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
        >
          {t('actions.confirm')}
        </button>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const reason = window.prompt(t('justifyPrompt'));
          if (reason) run(() => justifyEventAction(id, reason));
        }}
        className="rounded border border-blue-300 bg-white px-2 py-0.5 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
      >
        {t('actions.justify')}
      </button>
      {canConvert && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => convertEventAction(id))}
          className="rounded border border-amber-300 bg-white px-2 py-0.5 text-amber-700 hover:bg-amber-50 disabled:opacity-50"
        >
          {t('actions.convert')}
        </button>
      )}
      {status !== 'CANCELLED' && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (window.confirm(t('cancelConfirm'))) run(() => cancelEventAction(id));
          }}
          className="rounded border border-red-300 bg-white px-2 py-0.5 text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          {t('actions.cancel')}
        </button>
      )}
    </div>
  );
}
