'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { refundSellerAction, withdrawByCodeAction } from './refund-actions';

type Inst = { id: string; label: string };

export function RefundControl({ sellerId, campaignId, installments }: { sellerId: string; campaignId: string; installments: Inst[] }) {
  const t = useTranslations('admin.bourse.refund');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<'CASH' | 'FEE_CREDIT'>('CASH');
  const [instId, setInstId] = useState('');
  const [err, setErr] = useState('');

  return (
    <span className="flex flex-wrap items-center justify-end gap-1.5">
      {err && <span className="text-[10px] text-red-600" title={err}>!</span>}
      <select value={mode} onChange={(e) => setMode(e.target.value as 'CASH' | 'FEE_CREDIT')} className="rounded-lg border border-slate-300 px-1.5 py-1 text-xs">
        <option value="CASH">{t('cash')}</option>
        <option value="FEE_CREDIT">{t('credit')}</option>
      </select>
      {mode === 'FEE_CREDIT' && (
        <select value={instId} onChange={(e) => setInstId(e.target.value)} className="max-w-[160px] rounded-lg border border-slate-300 px-1.5 py-1 text-xs">
          <option value="">{t('pickInstallment')}</option>
          {installments.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
        </select>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => { setErr(''); start(async () => { const r = await refundSellerAction(sellerId, campaignId, mode, instId || undefined); if (!r.ok) return setErr(r.error); router.refresh(); }); }}
        className="rounded-lg bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {t('refund')}
      </button>
    </span>
  );
}

export function WithdrawForm({ campaignId }: { campaignId: string }) {
  const t = useTranslations('admin.bourse.refund');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setMsg(null);
    start(async () => {
      const r = await withdrawByCodeAction(campaignId, code.trim());
      setMsg(r.ok ? { ok: true, text: r.message ?? 'OK' } : { ok: false, text: r.error });
      if (r.ok) { setCode(''); router.refresh(); }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t('scanCode')} autoFocus className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
      <button disabled={pending} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50">{t('withdraw')}</button>
      {msg && <span className={`text-xs ${msg.ok ? 'text-emerald-600' : 'text-red-700'}`}>{msg.text}</span>}
    </form>
  );
}
