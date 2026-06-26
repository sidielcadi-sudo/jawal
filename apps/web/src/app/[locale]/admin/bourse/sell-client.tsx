'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { sellCopyAction } from './sell-actions';

const METHODS = ['CASH', 'CHEQUE', 'TRANSFER', 'CMI'] as const;

export function SellButton({ copyId, buyerId }: { copyId: string; buyerId?: string }) {
  const t = useTranslations('admin.bourse.vente');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [method, setMethod] = useState<string>('CASH');
  const [err, setErr] = useState('');
  return (
    <span className="flex items-center justify-end gap-1.5">
      {err && <span className="text-[10px] text-red-600" title={err}>!</span>}
      <select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded-lg border border-slate-300 px-1.5 py-1 text-xs">
        {METHODS.map((m) => <option key={m} value={m}>{t(`method.${m}`)}</option>)}
      </select>
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => { const r = await sellCopyAction(copyId, method, buyerId); if (!r.ok) return setErr(r.error); router.refresh(); })}
        className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {t('sell')}
      </button>
    </span>
  );
}
