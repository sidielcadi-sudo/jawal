import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/lib/i18n/routing';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('home');
  const tApp = await getTranslations('app');

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{t('title')}</h1>
      <p className="text-lg text-slate-600">{t('subtitle')}</p>
      <p className="text-sm text-slate-500">{tApp('tagline')}</p>
      <div className="flex gap-3">
        <Link
          href="/login"
          className="rounded-lg bg-brand-600 px-5 py-2.5 text-white shadow hover:bg-brand-700"
        >
          {t('cta.login')}
        </Link>
        <Link
          href="/demo"
          className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-slate-700 hover:bg-slate-50"
        >
          {t('cta.demo')}
        </Link>
      </div>
      <div className="mt-10 flex gap-3 text-xs text-slate-400">
        <Link href="/" locale="fr" className="hover:text-slate-700">
          Français
        </Link>
        <span>·</span>
        <Link href="/" locale="ar" className="hover:text-slate-700">
          العربية
        </Link>
      </div>
    </main>
  );
}
