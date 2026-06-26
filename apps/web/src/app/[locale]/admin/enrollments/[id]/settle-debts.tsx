'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { recordGroupPaymentAction } from '../admission-actions';

const METHODS = ['CASH', 'CHEQUE', 'TRANSFER', 'CMI', 'OTHER'] as const;
type Method = (typeof METHODS)[number];

/** Solde en une fois toutes les créances de la famille (réutilise l'encaissement groupé). */
export function SettleDebtsButton({
  installmentIds,
  total,
  currency,
}: {
  installmentIds: string[];
  total: number;
  currency: string;
}) {
  const t = useTranslations('admin.enrollments.detail.familyDebts');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [method, setMethod] = useState<Method>('CASH');
  const [reference, setReference] = useState('');
  const [err, setErr] = useState('');

  if (installmentIds.length === 0) return null;

  function submit() {
    setErr('');
    start(async () => {
      const res = await recordGroupPaymentAction(installmentIds, method, reference || undefined);
      if (!res.ok) return setErr(res.error);
      router.refresh();
    });
  }

  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <label className="text-[11px] font-medium text-amber-900">
        <span className="mb-0.5 block">{t('method')}</span>
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value as Method)}
          className="rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-sm text-slate-800"
        >
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {t(`methods.${m}`)}
            </option>
          ))}
        </select>
      </label>
      <input
        value={reference}
        onChange={(e) => setReference(e.target.value)}
        placeholder={t('reference')}
        className="rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-sm"
      />
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
      >
        {pending
          ? '…'
          : t('settleAll', { amount: total.toLocaleString(undefined), currency })}
      </button>
      {err && <p className="w-full text-xs text-red-700">{err}</p>}
    </div>
  );
}
