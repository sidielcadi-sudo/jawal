'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { recordSupplierPaymentAction, deleteInvoiceAction } from './actions';

const METHODS = ['TRANSFER', 'CHEQUE', 'CASH', 'CMI', 'OTHER'] as const;

export function PayInvoiceForm({ invoiceId, remaining }: { invoiceId: string; remaining: number }) {
  const t = useTranslations('admin.comptabilite.achats');
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');
  return (
    <form
      ref={ref}
      onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); fd.set('invoiceId', invoiceId); setErr(''); start(async () => { const r = await recordSupplierPaymentAction(fd); if (!r.ok) return setErr(r.error); ref.current?.reset(); router.refresh(); }); }}
      className="flex flex-wrap items-center justify-end gap-1.5"
    >
      <input name="amount" type="number" step="0.01" defaultValue={remaining.toFixed(2)} className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-xs text-end" />
      <select name="method" defaultValue="TRANSFER" className="rounded-lg border border-slate-300 px-1.5 py-1 text-xs">
        {METHODS.map((m) => <option key={m} value={m}>{t(`method.${m}`)}</option>)}
      </select>
      <input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="rounded-lg border border-slate-300 px-1.5 py-1 text-xs" />
      <button disabled={pending} className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">{t('pay')}</button>
      {err && <span className="text-[10px] text-red-600" title={err}>!</span>}
    </form>
  );
}

export function InvoiceDeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => { if (!confirm('Supprimer ?')) return; start(async () => { await deleteInvoiceAction(id); router.refresh(); }); }} className="text-xs text-slate-400 hover:text-red-600 disabled:opacity-50">✕</button>
  );
}
