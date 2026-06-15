'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { updateEstablishmentAction } from './actions';

const inputCls =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

const CURRENCIES = ['MAD', 'EUR', 'USD', 'TND', 'DZD'];
const TIMEZONES = [
  'Africa/Casablanca',
  'Africa/Algiers',
  'Africa/Tunis',
  'Europe/Paris',
  'UTC',
];

export function EstablishmentForm({
  initial,
}: {
  initial: { name: string; localeDefault: string; currency: string; timezone: string; slug: string };
}) {
  const t = useTranslations('admin.settings.establishment');
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  function onSubmit(formData: FormData) {
    setError('');
    setSaved(false);
    start(async () => {
      const r = await updateEstablishmentAction(formData);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="max-w-xl rounded-2xl border border-slate-200 bg-white p-6">
      <form action={onSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-700">{t('name')}</label>
          <input type="text" name="name" required defaultValue={initial.name} maxLength={120} className={inputCls} />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700">{t('slug')}</label>
          <input
            type="text"
            value={initial.slug}
            disabled
            className={`${inputCls} cursor-not-allowed bg-slate-50 font-mono text-slate-500`}
          />
          <p className="mt-1 text-[11px] text-slate-400">{t('slugHint')}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700">{t('localeDefault')}</label>
            <select name="localeDefault" defaultValue={initial.localeDefault} className={inputCls}>
              <option value="fr">{t('locales.fr')}</option>
              <option value="ar">{t('locales.ar')}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">{t('currency')}</label>
            <select name="currency" defaultValue={initial.currency} className={inputCls}>
              {(CURRENCIES.includes(initial.currency) ? CURRENCIES : [initial.currency, ...CURRENCIES]).map(
                (c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ),
              )}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700">{t('timezone')}</label>
          <select name="timezone" defaultValue={initial.timezone} className={inputCls}>
            {(TIMEZONES.includes(initial.timezone) ? TIMEZONES : [initial.timezone, ...TIMEZONES]).map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
          {t('logoSoon')}
        </div>

        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div>
        )}
        {saved && (
          <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
            {t('saved')}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
        >
          {isPending ? t('saving') : t('save')}
        </button>
      </form>
    </div>
  );
}
