'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { processPendingNotificationsAction, retryNotificationAction } from './actions';

export function ProcessQueueButton({ pending }: { pending: number }) {
  const t = useTranslations('admin.transport.notifications');
  const router = useRouter();
  const [running, start] = useTransition();
  const [msg, setMsg] = useState('');
  return (
    <span className="flex items-center gap-2">
      <button
        onClick={() => { setMsg(''); start(async () => { const r = await processPendingNotificationsAction(); setMsg(r.ok ? t('processed', { sent: r.sent, failed: r.failed }) : r.error); router.refresh(); }); }}
        disabled={running || pending === 0}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {t('processQueue', { n: pending })}
      </button>
      {msg && <span className="text-xs text-slate-500">{msg}</span>}
    </span>
  );
}

export function RetryButton({ id }: { id: string }) {
  const t = useTranslations('admin.transport.notifications');
  const router = useRouter();
  const [running, start] = useTransition();
  return (
    <button
      onClick={() => start(async () => { await retryNotificationAction(id); router.refresh(); })}
      disabled={running}
      className="text-[11px] font-medium text-brand-600 hover:underline disabled:opacity-50"
    >
      {t('retry')}
    </button>
  );
}
