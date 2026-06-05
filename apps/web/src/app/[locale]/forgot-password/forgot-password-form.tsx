'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/routing';
import { requestParentPasswordResetAction } from './actions';

export function ForgotPasswordForm({ locale }: { locale: string }) {
  const t = useTranslations('forgotPassword');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget);
    fd.set('locale', locale);
    startTransition(async () => {
      const r = await requestParentPasswordResetAction(fd);
      if (!r.ok) {
        setError(t('errors.invalidInput'));
        return;
      }
      setSent(true);
    });
  }

  const inputCls =
    'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

  if (sent) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
          {t('sent')}
        </div>
        <Link
          href="/login"
          className="text-brand-600 hover:text-brand-700 block text-center text-sm"
        >
          {t('backToLogin')}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm text-slate-500">{t('intro')}</p>

      <div>
        <label htmlFor="tenantSlug" className="block text-sm font-medium text-slate-700">
          {t('fields.tenantSlug')}
        </label>
        <input
          id="tenantSlug"
          name="tenantSlug"
          type="text"
          required
          defaultValue="demo"
          placeholder="demo"
          disabled={isPending}
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-700">
          {t('fields.email')}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          disabled={isPending}
          className={inputCls}
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="bg-brand-600 hover:bg-brand-700 focus-visible:ring-brand-500 w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50"
      >
        {isPending ? t('actions.sending') : t('actions.send')}
      </button>

      <Link href="/login" className="block text-center text-xs text-slate-500 hover:text-slate-700">
        {t('backToLogin')}
      </Link>
    </form>
  );
}
