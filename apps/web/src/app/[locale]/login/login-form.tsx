'use client';

import { useState, useTransition } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

type Props = {
  error?: string;
  callbackUrl?: string;
  locale: string;
};

export function LoginForm({ error: initialError, callbackUrl, locale }: Props) {
  const t = useTranslations('login');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(initialError ?? '');
  const [isSuperAdminMode, setSuperAdminMode] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const formData = new FormData(e.currentTarget);
    const email = String(formData.get('email') ?? '');
    const password = String(formData.get('password') ?? '');
    const tenantSlug = isSuperAdminMode ? '' : String(formData.get('tenantSlug') ?? '');

    startTransition(async () => {
      const result = await signIn('credentials', {
        email,
        password,
        tenantSlug,
        redirect: false,
      });

      if (result?.error) {
        setError(t('errors.invalidCredentials'));
        return;
      }
      const defaultTarget = isSuperAdminMode ? '/super-admin/tenants' : '/admin';
      router.push(callbackUrl ?? `/${locale}${defaultTarget}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {!isSuperAdminMode && (
        <div>
          <label htmlFor="tenantSlug" className="block text-sm font-medium text-slate-700">
            {t('fields.tenantSlug')}
          </label>
          <input
            id="tenantSlug"
            name="tenantSlug"
            type="text"
            required={!isSuperAdminMode}
            defaultValue="demo"
            placeholder="demo"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
      )}

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
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-slate-700">
          {t('fields.password')}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
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
        className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-50"
      >
        {isPending ? t('actions.signingIn') : t('actions.signIn')}
      </button>

      <button
        type="button"
        onClick={() => {
          setSuperAdminMode((v) => !v);
          setError('');
        }}
        className="block w-full text-center text-xs text-slate-500 hover:text-slate-700"
      >
        {isSuperAdminMode ? t('toggleToTenant') : t('toggleToSuperAdmin')}
      </button>
    </form>
  );
}
