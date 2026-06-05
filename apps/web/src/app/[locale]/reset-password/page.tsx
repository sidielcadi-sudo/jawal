import { setRequestLocale, getTranslations } from 'next-intl/server';
import { ResetPasswordForm } from './reset-password-form';

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { token } = await searchParams;
  const t = await getTranslations('resetPassword');

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="bg-brand-600 mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl text-xl font-bold text-white">
            J
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">{t('title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <ResetPasswordForm token={token ?? ''} locale={locale} />
        </div>
      </div>
    </main>
  );
}
