'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { recordPaymentAction } from '../../../persons/[id]/finance/actions';
import { publishFeeAction, cancelAssignmentAction } from '../actions';

type CreditTarget = { id: string; label: string; remaining: number };

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  function run(action: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError('');
    start(async () => {
      const r = await action();
      if (!r.ok) setError(r.error ?? 'Erreur');
      else {
        onOk?.();
        router.refresh();
      }
    });
  }
  return { pending, error, run };
}

/* ------------------------------ Publish panel --------------------------- */

export function PublishButton({
  feeId,
  status,
  mandatory,
}: {
  feeId: string;
  status: string;
  mandatory: boolean;
}) {
  const t = useTranslations('admin.exceptionalFees');
  const { pending, error, run } = useRun();

  if (status !== 'DRAFT') {
    return (
      <p className="text-xs text-slate-500">
        {status === 'PUBLISHED' ? t('assign.publishedNote') : t('assign.closedNote')}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
      )}
      <p className="text-xs text-slate-500">
        {mandatory ? t('assign.publishHintMandatory') : t('assign.publishHintOptional')}
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => publishFeeAction(feeId))}
        className="w-full rounded-lg bg-gradient-to-r from-brand-600 to-brand-800 px-4 py-2 text-sm font-medium text-white hover:from-brand-700 hover:to-brand-900 disabled:opacity-50"
      >
        {t('publish')}
      </button>
    </div>
  );
}

/* ------------------------------ Payment form ---------------------------- */

const METHODS = ['CASH', 'CHEQUE', 'TRANSFER', 'OTHER'] as const;

export function PayButton({
  installmentId,
  remaining,
  currency,
}: {
  installmentId: string;
  remaining: number;
  currency: string;
}) {
  const t = useTranslations('admin.exceptionalFees.pay');
  const { pending, error, run } = useRun();
  const [open, setOpen] = useState(false);
  const inputCls = 'rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-800';

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-brand-700 hover:underline">
        {t('record')}
      </button>
    );
  }
  return (
    <form
      action={(fd) => {
        fd.set('installmentId', installmentId);
        run(() => recordPaymentAction(fd), () => setOpen(false));
      }}
      className="flex flex-wrap items-end gap-1.5"
    >
      {error && <span className="w-full text-[11px] text-red-600">{error}</span>}
      <input name="amount" type="number" min={0} step="0.01" defaultValue={remaining} required className={`w-20 ${inputCls}`} title={`${t('amount')} (${currency})`} />
      <select name="method" className={inputCls} defaultValue="CASH">
        {METHODS.map((m) => (
          <option key={m} value={m}>{t(`methods.${m}`)}</option>
        ))}
      </select>
      <input name="reference" placeholder={t('reference')} className={`w-24 ${inputCls}`} />
      <button type="submit" disabled={pending} className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50">
        {t('confirm')}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-600">
        {t('cancel')}
      </button>
    </form>
  );
}

/* ------------------------------ Cancel / refund ------------------------- */

export function CancelButton({
  assignmentId,
  paid,
  currency,
  creditTargets,
}: {
  assignmentId: string;
  paid: number;
  currency: string;
  creditTargets: CreditTarget[];
}) {
  const t = useTranslations('admin.exceptionalFees.cancelFee');
  const { pending, error, run } = useRun();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'CREDIT' | 'REFUND'>(creditTargets.length > 0 ? 'CREDIT' : 'REFUND');

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-red-600 hover:underline">
        {t('action')}
      </button>
    );
  }

  return (
    <form
      action={(fd) => {
        fd.set('assignmentId', assignmentId);
        fd.set('mode', paid > 0 ? mode : 'NONE');
        run(() => cancelAssignmentAction(fd), () => setOpen(false));
      }}
      className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-start"
    >
      {error && <div className="text-[11px] text-red-600">{error}</div>}
      {paid === 0 ? (
        <p className="text-[11px] text-slate-600">{t('confirmUnpaid')}</p>
      ) : (
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-[11px] text-slate-700">
            <input
              type="radio"
              checked={mode === 'CREDIT'}
              disabled={creditTargets.length === 0}
              onChange={() => setMode('CREDIT')}
            />
            {t('credit')}
          </label>
          {mode === 'CREDIT' && (
            <select name="targetInstallmentId" className="w-full rounded border border-slate-300 px-1.5 py-1 text-[11px]">
              {creditTargets.map((ct) => (
                <option key={ct.id} value={ct.id}>
                  {ct.label} — {ct.remaining.toLocaleString()} {currency}
                </option>
              ))}
            </select>
          )}
          <label className="flex items-center gap-1.5 text-[11px] text-slate-700">
            <input type="radio" checked={mode === 'REFUND'} onChange={() => setMode('REFUND')} />
            {t('refund')}
          </label>
          {mode === 'REFUND' && (
            <input type="file" name="file" accept=".pdf,image/png,image/jpeg,image/webp" className="block w-full text-[11px]" />
          )}
        </div>
      )}
      <div className="flex gap-1.5">
        <button type="submit" disabled={pending} className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50">
          {t('confirm')}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-600">
          {t('cancel')}
        </button>
      </div>
    </form>
  );
}
