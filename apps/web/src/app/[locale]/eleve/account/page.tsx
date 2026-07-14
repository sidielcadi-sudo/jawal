import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { PasswordForm } from './account-form';

export default async function StudentAccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('eleve.account');

  return (
    <div className="px-3 py-3">
      <header className="mb-4 overflow-hidden -mx-3 rounded-2xl border border-brand-200 bg-gradient-to-r from-brand-100 to-brand-50 shadow-sm px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
        <p className="mt-0.5 text-sm text-slate-600">{session.user.email}</p>
      </header>
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-700">{t('changePassword')}</h2>
        <div className="mt-3">
          <PasswordForm />
        </div>
      </section>
    </div>
  );
}
