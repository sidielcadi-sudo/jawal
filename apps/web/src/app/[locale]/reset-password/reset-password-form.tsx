'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/routing';
import { resetPasswordAction } from './actions';

export function ResetPasswordForm({ token, locale }: { token: string; locale: string }) {
  const t = useTranslations('resetPassword');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const errorMessage = (code: string) =>
    code === 'WEAK_PASSWORD'
      ? t('errors.weakPassword')
      : code === 'MISMATCH'
        ? t('errors.mismatch')
        : t('errors.invalidToken');

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget);
    fd.set('token', token);
    startTransition(async () => {
      const r = await resetPasswordAction(fd);
      if (!r.ok) {
        setError(errorMessage(r.error));
        return;
      }
      setDone(true);
    });
  }

  const inputCls =
    'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

  if (!token) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
          {t('errors.invalidToken')}
        </div>
        <Link
          href="/forgot-password"
          className="text-brand-600 hover:text-brand-700 block text-center text-sm"
        >
          {t('requestNew')}
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
          {t('done')}
        </div>
        <button
          type="button"
          onClick={() => router.push(`/${locale}/login`)}
          className="bg-brand-600 hover:bg-brand-700 w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow"
        >
          {t('goToLogin')}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="newPassword" className="block text-sm font-medium text-slate-700">
          {t('fields.newPassword')}
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          disabled={isPending}
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="confirm" className="block text-sm font-medium text-slate-700">
          {t('fields.confirm')}
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          required
          autoComplete="new-password"
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
        {isPending ? t('actions.saving') : t('actions.save')}
      </button>
    </form>
  );
}
