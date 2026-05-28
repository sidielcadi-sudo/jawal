import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { ImportClient } from './client';

export default async function ImportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.persons.import');

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <nav className="mb-4 text-xs text-slate-500">
        <Link href={`/${locale}/admin/persons`} className="hover:text-brand-700">
          {t('parentTitle')}
        </Link>
        <span className="mx-1.5">›</span>
        <span>{t('title')}</span>
      </nav>

      <h1 className="text-2xl font-semibold text-slate-900">{t('title')}</h1>
      <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
        <ImportClient />
      </div>
    </div>
  );
}
