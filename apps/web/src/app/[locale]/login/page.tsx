import { setRequestLocale, getTranslations } from 'next-intl/server';
import { loadPreAuthBranding } from '@/lib/tenant-logo';
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

  const { name, logo } = await loadPreAuthBranding();

  return (
    <main className="flex min-h-screen items-center justify-center bg-white bg-[url('/login-bg.png')] bg-cover bg-center bg-no-repeat px-4 py-4">
      <div className="w-full max-w-md">
        <div className="rounded-3xl bg-[#1A56DB] bg-[url('/form-bg.png')] bg-cover bg-center p-5 text-white shadow-2xl sm:p-6">
          <div className="mb-4 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logo ?? '/sesame-logo.png'}
              alt={name ?? 'Logo'}
              className="mx-auto mb-2 h-12 w-auto object-contain"
            />
            {name && <p className="text-sm font-bold text-white">{name}</p>}
            <h1 className="mt-0.5 text-xl font-bold text-white">{t('title')}</h1>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <LoginForm error={sp.error} callbackUrl={sp.callbackUrl} locale={locale} />
          </div>

          {/* Logo Jawal en bas, centré */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/jawal-logo.png" alt="Jawal" className="mx-auto mt-4 h-9 w-auto object-contain" />
        </div>
      </div>
    </main>
  );
}
