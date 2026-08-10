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
  initial: {
    name: string;
    localeDefault: string;
    currency: string;
    timezone: string;
    slug: string;
    massarCode: string;
  };
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

        <div>
          <label className="block text-xs font-medium text-slate-700">{t('massarCode')}</label>
          <input
            type="text"
            name="massarCode"
            defaultValue={initial.massarCode}
            maxLength={32}
            placeholder="CASA001"
            className={`${inputCls} font-mono uppercase`}
          />
          <p className="mt-1 text-[11px] text-slate-400">{t('massarCodeHint')}</p>
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

export function LogoUploader({ hasLogo }: { hasLogo: boolean }) {
  const t = useTranslations('admin.settings.establishment.logo');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [present, setPresent] = useState(hasLogo);
  const [file, setFile] = useState<File | null>(null);

  async function upload() {
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set('file', file);
      const res = await fetch('/api/admin/tenant/logo/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        setError((await res.text()) || t('error'));
        return;
      }
      setFile(null);
      setPresent(true);
      setVersion(Date.now());
      router.refresh();
    } catch {
      setError(t('error'));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/admin/tenant/logo/upload', { method: 'DELETE' });
      if (!res.ok) {
        setError((await res.text()) || t('error'));
        return;
      }
      setPresent(false);
      setVersion(Date.now());
      router.refresh();
    } catch {
      setError(t('error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 max-w-xl rounded-2xl border border-slate-200 bg-white p-6">
      <h3 className="text-sm font-semibold text-slate-900">{t('title')}</h3>
      <p className="mt-1 text-xs text-slate-500">{t('hint')}</p>

      <div className="mt-4 flex items-center gap-4">
        <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          {present ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/tenant/logo?v=${version}`} alt="logo" className="max-h-16 max-w-16 object-contain" />
          ) : (
            <span className="text-2xl">🎓</span>
          )}
        </div>
        <div className="flex-1">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-xs text-slate-600 file:me-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200"
          />
          <p className="mt-1 text-[11px] text-slate-400">{t('formats')}</p>
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={upload}
          disabled={busy || !file}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
        >
          {busy ? t('uploading') : t('upload')}
        </button>
        {present && (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {t('remove')}
          </button>
        )}
      </div>
    </div>
  );
}
