'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { notifyLineEventAction } from './appel-actions';

export function LineEventButtons({ lineId }: { lineId: string }) {
  const t = useTranslations('admin.transport.appel');
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState('');

  function fire(event: 'approaching' | 'delay') {
    const def = event === 'approaching' ? 5 : 10;
    const raw = window.prompt(t('minutesPrompt'), String(def));
    if (raw === null) return;
    const minutes = Number(raw) || def;
    setMsg('');
    start(async () => {
      const r = await notifyLineEventAction(lineId, event, minutes);
      setMsg(r.ok ? t('eventSent', { n: r.sent }) : r.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => fire('approaching')}
        disabled={pending}
        className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
      >
        🚌 {t('busApproaching')}
      </button>
      <button
        type="button"
        onClick={() => fire('delay')}
        disabled={pending}
        className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50"
      >
        ⏱ {t('busDelay')}
      </button>
      {msg && <span className="text-xs text-slate-500">{msg}</span>}
    </div>
  );
}
