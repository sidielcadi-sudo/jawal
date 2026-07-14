import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { ImportClient } from './client';

export default async function ImportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.persons.import');

  return (
    <div className="px-3 py-3">
      <nav className="mb-4 text-xs text-slate-500">
        <Link href={`/${locale}/admin/persons`} className="hover:text-brand-700">
          {t('parentTitle')}
        </Link>
        <span className="mx-1.5">›</span>
        <span>{t('title')}</span>
      </nav>

      <header className="overflow-hidden -mx-3 rounded-2xl border border-brand-200 bg-gradient-to-r from-brand-100 to-brand-50 shadow-sm px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
        <p className="mt-0.5 text-sm text-slate-600">{t('subtitle')}</p>
      </header>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
        <ImportClient />
      </div>
    </div>
  );
}
