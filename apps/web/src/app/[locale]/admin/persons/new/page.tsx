import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { PersonForm } from '../person-form';

export default async function NewPersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations('admin.persons');

  const defaultType = (['STUDENT', 'TEACHER', 'STAFF', 'PARENT'] as const).includes(
    sp.type as never,
  )
    ? (sp.type as 'STUDENT' | 'TEACHER' | 'STAFF' | 'PARENT')
    : 'STUDENT';

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <nav className="mb-4 text-xs text-slate-500">
        <Link href={`/${locale}/admin/persons`} className="hover:text-brand-700">
          {t('title.ALL')}
        </Link>
        <span className="mx-1.5">›</span>
        <span>{t('actions.new')}</span>
      </nav>

      <h1 className="text-2xl font-semibold text-slate-900">{t('actions.new')}</h1>
      <p className="mt-1 text-sm text-slate-500">{t('newSubtitle')}</p>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
        <PersonForm mode="create" locale={locale} initial={{ type: defaultType }} />
      </div>
    </div>
  );
}
