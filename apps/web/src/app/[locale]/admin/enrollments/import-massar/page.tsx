import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { prismaAdmin, withTenant } from '@/lib/db';
import { ImportMassarClient } from './client';

export default async function ImportMassarPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.enrollments.importMassar');

  const session = (await auth())!;
  const tenantId = session.user.tenantId;

  const [tenant, years] = await Promise.all([
    prismaAdmin.tenant.findUnique({ where: { id: tenantId }, select: { massarCode: true } }),
    withTenant(tenantId, (tx) =>
      tx.academicYear.findMany({
        orderBy: { startDate: 'desc' },
        select: { id: true, label: true, active: true },
      }),
    ),
  ]);

  const defaultYearId = years.find((y) => y.active)?.id ?? years[0]?.id ?? '';

  return (
    <div className="px-3 py-3">
      <nav className="mb-4 text-xs text-slate-500">
        <Link href={`/${locale}/admin/enrollments`} className="hover:text-brand-700">
          {t('breadcrumb')}
        </Link>
        <span className="mx-1.5">›</span>
        <span>{t('title')}</span>
      </nav>

      <header className="overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
        <p className="mt-0.5 text-sm text-slate-600">{t('subtitle')}</p>
      </header>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
        {years.length === 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-900">
            {t('noYear')}{' '}
            <Link href={`/${locale}/admin/settings/years`} className="font-medium underline">
              {t('goToYears')} →
            </Link>
          </div>
        ) : (
          <ImportMassarClient
            years={years}
            defaultYearId={defaultYearId}
            tenantMassarCode={tenant?.massarCode ?? null}
          />
        )}
      </div>
    </div>
  );
}
