import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { YearEditForm, PeriodsManager } from './client';

export default async function EditYearPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.settings.years');

  const session = (await auth())!;
  const data = await withTenant(session.user.tenantId, async (tx) => {
    const year = await tx.academicYear.findUnique({ where: { id } });
    if (!year) return null;
    const periods = await tx.period.findMany({
      where: { academicYearId: id },
      orderBy: { startDate: 'asc' },
    });
    return { year, periods };
  });
  if (!data) notFound();
  const { year, periods } = data;

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

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <PeriodsManager
          yearId={year.id}
          locale={locale}
          periods={periods.map((p) => ({
            id: p.id,
            label: p.label,
            kind: p.kind,
            startDate: p.startDate.toISOString().slice(0, 10),
            endDate: p.endDate.toISOString().slice(0, 10),
          }))}
        />
      </div>
    </div>
  );
}
