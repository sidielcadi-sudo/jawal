'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  updateYearAction,
  createPeriodAction,
  deletePeriodAction,
  generatePeriodsAction,
} from '../../actions';

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

type Period = { id: string; label: string; kind: string; startDate: string; endDate: string };

export function PeriodsManager({
  yearId,
  periods,
  locale,
}: {
  yearId: string;
  periods: Period[];
  locale: string;
}) {
  const t = useTranslations('admin.settings.years.periods');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError('');
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? 'Erreur');
      else router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">{t('title')}</h3>
        {periods.length === 0 && (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(() => generatePeriodsAction(yearId, 'TRIMESTER'))}
              className="rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50"
            >
              {t('gen3')}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(() => generatePeriodsAction(yearId, 'SEMESTER'))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {t('gen2')}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div>
      )}

      {periods.length === 0 ? (
        <p className="text-xs text-slate-500">{t('empty')}</p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
          {periods.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>
                <span className="font-medium text-slate-800">{p.label}</span>
                <span className="ms-2 text-xs text-slate-400">
                  {new Date(p.startDate).toLocaleDateString(locale)} →{' '}
                  {new Date(p.endDate).toLocaleDateString(locale)}
                </span>
              </span>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  if (confirm(t('confirmDelete'))) run(() => deletePeriodAction(p.id, yearId));
                }}
                className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
              >
                {t('delete')}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        action={(fd) => run(() => createPeriodAction(yearId, fd))}
        className="flex flex-wrap items-end gap-2 border-t border-slate-200 pt-3"
      >
        <label className="flex flex-col text-xs text-slate-500">
          {t('form.kind')}
          <select name="kind" defaultValue="TRIMESTER" className={`${inputCls} mt-0.5 w-32`}>
            <option value="TRIMESTER">{t('kinds.TRIMESTER')}</option>
            <option value="SEMESTER">{t('kinds.SEMESTER')}</option>
            <option value="MODULE">{t('kinds.MODULE')}</option>
            <option value="SESSION">{t('kinds.SESSION')}</option>
          </select>
        </label>
        <label className="flex flex-col text-xs text-slate-500">
          {t('form.label')}
          <input name="label" required placeholder="Trimestre 1" className={`${inputCls} mt-0.5 w-40`} />
        </label>
        <label className="flex flex-col text-xs text-slate-500">
          {t('form.start')}
          <input type="date" name="startDate" required className={`${inputCls} mt-0.5`} />
        </label>
        <label className="flex flex-col text-xs text-slate-500">
          {t('form.end')}
          <input type="date" name="endDate" required className={`${inputCls} mt-0.5`} />
        </label>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {t('add')}
        </button>
      </form>
    </div>
  );
}
