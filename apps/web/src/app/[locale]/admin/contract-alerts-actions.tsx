'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

export function ContractAlertsActions({ locale: _locale }: { locale: string }) {
  const t = useTranslations('admin.dashboard.contractAlerts');
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [msg, setMsg] = useState('');

  function onClick() {
    setMsg('');
    startTransition(async () => {
      const r = await fetch('/api/cron/contract-alerts', { method: 'POST' });
      if (!r.ok) {
        setMsg(t('triggerFailed'));
        return;
      }
      const data = (await r.json()) as {
        results?: Array<{ tenant: string; recipients: number; alerts: number }>;
      };
      const total =
        data.results?.reduce((acc, r) => ({ rec: acc.rec + r.recipients, al: acc.al + r.alerts }), {
          rec: 0,
          al: 0,
        }) ?? { rec: 0, al: 0 };
      setMsg(t('triggerOk', { recipients: total.rec, alerts: total.al }));
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-xs text-slate-500">{msg}</span>}
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {busy ? t('triggering') : `📧 ${t('triggerNow')}`}
      </button>
    </div>
  );
}
