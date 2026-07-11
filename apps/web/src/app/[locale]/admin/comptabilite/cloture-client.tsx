'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { closeFiscalYearAction, reopenFiscalYearAction } from './cloture-actions';

export function CloseYearButton({ yearId }: { yearId: string }) {
  const t = useTranslations('admin.comptabilite.cloture');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <span className="flex items-center gap-2">
      <button
        onClick={() => { if (!confirm(t('closeConfirm'))) return; setMsg(null); start(async () => { const r = await closeFiscalYearAction(yearId); setMsg(r.ok ? { ok: true, text: r.message ?? 'OK' } : { ok: false, text: r.error }); if (r.ok) router.refresh(); }); }}
        disabled={pending}
        className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {t('close')}
      </button>
      {msg && <span className={`text-xs ${msg.ok ? 'text-emerald-600' : 'text-red-700'}`}>{msg.text}</span>}
    </span>
  );
}

export function ReopenYearButton({ yearId }: { yearId: string }) {
  const t = useTranslations('admin.comptabilite.cloture');
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => { if (!confirm(t('reopenConfirm'))) return; start(async () => { await reopenFiscalYearAction(yearId); router.refresh(); }); }}
      disabled={pending}
      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
    >
      {t('reopen')}
    </button>
  );
}
