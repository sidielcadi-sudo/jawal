'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { generateInstallmentsAction, recordPaymentAction, waiveInstallmentDebtAction } from './actions';

const inputCls =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

const METHODS = ['CASH', 'CHEQUE', 'TRANSFER', 'CMI', 'STRIPE', 'OTHER'] as const;

export function GenerateForm({
  studentId,
  fees,
}: {
  studentId: string;
  fees: { id: string; label: string }[];
}) {
  const t = useTranslations('admin.studentFinance.generate');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feeId, setFeeId] = useState(fees[0]?.id ?? '');
  const [error, setError] = useState('');

  function submit() {
    if (!feeId) return;
    if (!confirm(t('confirm'))) return;
    setError('');
    const fd = new FormData();
    fd.set('studentId', studentId);
    fd.set('feeScheduleItemId', feeId);
    startTransition(async () => {
      const r = await generateInstallmentsAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('schedule')}</label>
        <select
          value={feeId}
          onChange={(e) => setFeeId(e.target.value)}
          className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm shadow-sm"
        >
          {fees.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={isPending || !feeId}
        className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
      >
        {isPending ? t('generating') : t('generate')}
      </button>
      {error && <p className="w-full text-xs text-red-700">{error}</p>}
    </div>
  );
}

/** Effacement de créance (remise gracieuse) sur le reliquat d'une échéance. */
export function WaiveDebtButton({
  installmentId,
  remaining,
  currency,
}: {
  installmentId: string;
  remaining: number;
  currency: string;
}) {
  const t = useTranslations('admin.studentFinance.waive');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  function submit() {
    setError('');
    if (!reason.trim()) {
      setError(t('reasonRequired'));
      return;
    }
    startTransition(async () => {
      const r = await waiveInstallmentDebtAction(installmentId, reason);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ms-1 rounded-lg border border-amber-300 px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-50"
      >
        {t('action')}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-slate-900/40 p-4" onClick={() => setOpen(false)}>
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 text-start shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-slate-900">{t('title')}</h3>
        <p className="mt-1 text-xs text-slate-500">
          {t('remaining')} : <strong>{remaining.toFixed(2)} {currency}</strong>
        </p>
        <p className="mt-2 text-xs text-amber-700">{t('hint')}</p>
        <div className="mt-3">
          <label className="block text-xs font-medium text-slate-700">{t('reason')}</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder={t('reasonPlaceholder')}
            className={inputCls}
          />
        </div>
        {error && <div className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div>}
        <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-3">
          <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
            {t('cancel')}
          </button>
          <button type="button" onClick={submit} disabled={isPending} className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-amber-700 disabled:opacity-50">
            {isPending ? t('waiving') : t('confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function RecordPaymentButton({
  installmentId,
  remaining,
  currency,
}: {
  installmentId: string;
  remaining: number;
  currency: string;
}) {
  const t = useTranslations('admin.studentFinance.payment');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<string>(remaining.toFixed(2));
  const [method, setMethod] = useState<string>('CASH');
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');

  function submit() {
    setError('');
    const fd = new FormData();
    fd.set('installmentId', installmentId);
    fd.set('amount', amount);
    fd.set('method', method);
    fd.set('reference', reference);
    fd.set('paidAt', new Date().toISOString());
    startTransition(async () => {
      const r = await recordPaymentAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-brand-600 px-2 py-0.5 text-xs font-medium text-white shadow hover:bg-brand-700"
      >
        {t('record')}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-slate-900/40 p-4" onClick={() => setOpen(false)}>
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 text-start shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-slate-900">{t('title')}</h3>
        <p className="mt-1 text-xs text-slate-500">
          {t('remaining')} : <strong>{remaining.toFixed(2)} {currency}</strong>
        </p>
        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-700">
              {t('amount')} ({currency})
            </label>
            <input
              type="number"
              min={0.01}
              max={remaining}
              step={0.01}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">{t('method')}</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(`methods.${m}` as never)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">{t('reference')}</label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={t('referencePlaceholder')}
              className={inputCls}
            />
          </div>
          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isPending}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
          >
            {isPending ? t('recording') : t('record')}
          </button>
        </div>
      </div>
    </div>
  );
}
