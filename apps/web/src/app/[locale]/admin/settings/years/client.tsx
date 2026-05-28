'use client';

import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createYearAction, setActiveYearAction } from './actions';

const inputCls =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

export function YearCreateForm() {
  const t = useTranslations('admin.settings.years');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  function onSubmit(formData: FormData) {
    setError('');
    startTransition(async () => {
      const result = await createYearAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      formRef.current?.reset();
      router.refresh();
    });
  }

  return (
    <form ref={formRef} action={onSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('form.label')}</label>
        <input type="text" name="label" required placeholder="2026-2027" className={inputCls} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('form.start')}</label>
        <input type="date" name="startDate" required className={inputCls} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('form.end')}</label>
        <input type="date" name="endDate" required className={inputCls} />
      </div>
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
      >
        {isPending ? t('form.creating') : t('form.create')}
      </button>
    </form>
  );
}

export function ActivateButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() =>
        startTransition(async () => {
          await setActiveYearAction(id);
          router.refresh();
        })
      }
      disabled={isPending}
      className="rounded-lg border border-emerald-300 bg-white px-2 py-0.5 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
    >
      {label}
    </button>
  );
}
