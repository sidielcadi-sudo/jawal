import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { GradesExportForm } from './client';

export default async function ExportsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.exports');

  const session = (await auth())!;
  const { classes, periods } = await withTenant(session.user.tenantId, async (tx) => {
    const activeYear = await tx.academicYear.findFirst({
      where: { active: true },
      include: { periods: { orderBy: { startDate: 'asc' } } },
    });
    const classes = await tx.class.findMany({
      where: { deletedAt: null, ...(activeYear ? { academicYearId: activeYear.id } : {}) },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return { classes, periods: activeYear?.periods ?? [] };
  });

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ExportCard
          icon="👥"
          title={t('students.title')}
          description={t('students.description')}
          downloadHref="/api/admin/exports/students.csv"
          downloadLabel={t('actions.download')}
        />
        <ExportCard
          icon="💰"
          title={t('finance.title')}
          description={t('finance.description')}
          downloadHref="/api/admin/exports/finance.csv"
          downloadLabel={t('actions.download')}
        />
      </div>

      <section className="mt-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-start gap-3">
            <div className="text-3xl">📝</div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-slate-900">{t('grades.title')}</h2>
              <p className="mt-1 text-sm text-slate-500">{t('grades.description')}</p>
              <div className="mt-4">
                <GradesExportForm classes={classes} periods={periods.map((p) => ({ id: p.id, label: p.label }))} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <p className="mt-6 text-xs text-slate-500">{t('utf8Note')}</p>
    </div>
  );
}

function ExportCard({
  icon,
  title,
  description,
  downloadHref,
  downloadLabel,
}: {
  icon: string;
  title: string;
  description: string;
  downloadHref: string;
  downloadLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-start gap-3">
        <div className="text-3xl">{icon}</div>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
          <a
            href={downloadHref}
            className="mt-3 inline-flex items-center rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-brand-700"
            download
          >
            📥 {downloadLabel}
          </a>
        </div>
      </div>
    </div>
  );
}
