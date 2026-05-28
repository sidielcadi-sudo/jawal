'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { updateYearAction } from '../../actions';

const inputCls =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

export function YearEditForm({
  id,
  initial,
  locale,
}: {
  id: string;
  initial: { label: string; startDate: string; endDate: string };
  locale: string;
}) {
  const t = useTranslations('admin.settings.years');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

  function onSubmit(formData: FormData) {
    setError('');
    startTransition(async () => {
      const result = await updateYearAction(id, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/${locale}/admin/settings/years`);
      router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('form.label')}</label>
        <input type="text" name="label" required defaultValue={initial.label} className={inputCls} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-700">{t('form.start')}</label>
          <input
            type="date"
            name="startDate"
            required
            defaultValue={initial.startDate}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700">{t('form.end')}</label>
          <input
            type="date"
            name="endDate"
            required
            defaultValue={initial.endDate}
            className={inputCls}
          />
        </div>
      </div>
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div>
      )}
      <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          {t('form.cancel')}
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
        >
          {isPending ? t('form.saving') : t('form.save')}
        </button>
      </div>
    </form>
  );
}
