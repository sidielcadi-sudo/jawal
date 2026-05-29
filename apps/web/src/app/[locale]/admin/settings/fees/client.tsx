'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createFeeScheduleAction, deleteFeeScheduleAction } from './actions';

const inputCls =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

export function FeeCreateForm({
  years,
  levels,
  currency,
}: {
  years: { id: string; label: string; active: boolean }[];
  levels: { id: string; label: string }[];
  currency: string;
}) {
  const t = useTranslations('admin.settings.fees.form');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const ref = useRef<HTMLFormElement>(null);

  function onSubmit(formData: FormData) {
    setError('');
    startTransition(async () => {
      const r = await createFeeScheduleAction(formData);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      ref.current?.reset();
      router.refresh();
    });
  }

  const defaultYearId = years.find((y) => y.active)?.id ?? years[0]?.id;

  return (
    <form ref={ref} action={onSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('year')}</label>
        <select name="academicYearId" required defaultValue={defaultYearId} className={inputCls}>
          {years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.label}
              {y.active ? ' (actif)' : ''}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('level')}</label>
        <select name="levelId" required defaultValue="" className={inputCls}>
          <option value="" disabled>
            —
          </option>
          {levels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('label')}</label>
        <input type="text" name="label" required placeholder="Frais annuels" className={inputCls} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-slate-700">
            {t('totalAmount')} ({currency})
          </label>
          <input
            type="number"
            name="totalAmount"
            required
            min={1}
            step="0.01"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700">{t('installmentCount')}</label>
          <input
            type="number"
            name="installmentCount"
            defaultValue={9}
            min={1}
            max={24}
            className={inputCls}
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('firstDueMonth')}</label>
        <select name="firstDueMonth" defaultValue={9} className={inputCls}>
          {Array.from({ length: 12 }).map((_, i) => (
            <option key={i + 1} value={i + 1}>
              {new Date(2000, i, 1).toLocaleString('fr', { month: 'long' })}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
      >
        {isPending ? t('creating') : t('create')}
      </button>
    </form>
  );
}

export function FeeRowActions({ id }: { id: string }) {
  const t = useTranslations('admin.settings.fees');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function del() {
    if (!confirm(t('confirmDelete'))) return;
    startTransition(async () => {
      const r = await deleteFeeScheduleAction(id);
      if (r.ok) router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={del}
      disabled={isPending}
      className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
    >
      {t('actions.delete')}
    </button>
  );
}
