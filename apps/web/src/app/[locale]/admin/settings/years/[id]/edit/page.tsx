import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { YearEditForm } from './client';

export default async function EditYearPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.settings.years');

  const session = (await auth())!;
  const year = await withTenant(session.user.tenantId, (tx) =>
    tx.academicYear.findUnique({ where: { id } }),
  );
  if (!year) notFound();

  return (
    <div className="max-w-2xl">
      <Link
        href={`/${locale}/admin/settings/years`}
        className="text-xs text-slate-500 hover:text-brand-700"
      >
        ← {t('backToList')}
      </Link>
      <h2 className="mt-3 text-lg font-semibold text-slate-900">
        {t('edit')} — {year.label}
      </h2>
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
        <YearEditForm
          id={year.id}
          locale={locale}
          initial={{
            label: year.label,
            startDate: year.startDate.toISOString().slice(0, 10),
            endDate: year.endDate.toISOString().slice(0, 10),
          }}
        />
      </div>
    </div>
  );
}
