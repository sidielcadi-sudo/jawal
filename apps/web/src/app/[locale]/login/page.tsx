import { setRequestLocale, getTranslations } from 'next-intl/server';
import { LoginForm } from './login-form';

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sp = await searchParams;
  const t = await getTranslations('login');

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/sesame-logo.png" alt="Sesame" className="mx-auto mb-4 h-12 w-auto" />
          <h1 className="text-2xl font-semibold text-slate-900">{t('title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <LoginForm error={sp.error} callbackUrl={sp.callbackUrl} locale={locale} />
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">{t('demoHint')}</p>
      </div>
    </main>
  );
}
