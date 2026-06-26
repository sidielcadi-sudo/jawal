'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createExpenseAction, deleteExpenseAction } from './actions';

const CATEGORIES = ['SALARY', 'RENT', 'UTILITIES', 'SUPPLIES', 'MAINTENANCE', 'TRANSPORT', 'TAXES', 'OTHER'] as const;
const METHODS = ['CASH', 'CHEQUE', 'TRANSFER', 'OTHER'] as const;

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

export function CreateExpenseForm({ currency }: { currency: string }) {
  const t = useTranslations('admin.finance.expenses');
  const { pending, error, run } = useRun();
  const inputCls = 'mt-0.5 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-800';
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form
      action={(fd) =>
        run(
          () => createExpenseAction(fd),
          () => (document.getElementById('expense-form') as HTMLFormElement)?.reset(),
        )
      }
      id="expense-form"
      className="space-y-3"
    >
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
      <label className="block text-xs text-slate-500">
        {t('form.label')}
        <input name="label" required maxLength={160} className={inputCls} placeholder={t('form.labelPh')} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs text-slate-500">
          {t('form.category')}
          <select name="category" className={inputCls} defaultValue="OTHER">
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`categories.${c}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-slate-500">
          {t('form.amount')} ({currency})
          <input name="amount" type="number" min={0} step="0.01" required className={inputCls} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs text-slate-500">
          {t('form.date')}
          <input name="date" type="date" required defaultValue={today} className={inputCls} />
        </label>
        <label className="block text-xs text-slate-500">
          {t('form.method')}
          <select name="method" className={inputCls} defaultValue="">
            <option value="">—</option>
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {t(`methods.${m}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-xs text-slate-500">
        {t('form.note')}
        <input name="note" maxLength={2000} className={inputCls} />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {t('form.create')}
      </button>
    </form>
  );
}

export function ExpenseRowActions({ id }: { id: string }) {
  const t = useTranslations('admin.finance.expenses');
  const { pending, run } = useRun();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (window.confirm(t('confirmDelete'))) run(() => deleteExpenseAction(id));
      }}
      className="text-xs text-red-600 hover:underline disabled:opacity-50"
    >
      {t('delete')}
    </button>
  );
}
