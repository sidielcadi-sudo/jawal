import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { GenerateGlobalForm } from './form';

export default async function GenerateGlobalPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const session = (await auth())!;
  const t = await getTranslations('admin.timetable.generateMulti');

  const { years, currentYearId, classes } = await withTenant(
    session.user.tenantId,
    async (tx) => {
      const years = await tx.academicYear.findMany({
        orderBy: { startDate: 'desc' },
        select: { id: true, label: true, active: true },
      });
      const activeYear = years.find((y) => y.active);
      const currentYearId =
        sp.year ?? activeYear?.id ?? years[0]?.id ?? null;

      const classes = currentYearId
        ? await tx.class.findMany({
            where: { academicYearId: currentYearId, deletedAt: null },
            include: {
              level: { select: { label: true } },
              _count: {
                select: {
                  teacherAssignments: true,
                  timetableEntries: true,
                },
              },
            },
            orderBy: [{ level: { order: 'asc' } }, { name: 'asc' }],
          })
        : [];

      return { years, currentYearId, classes };
    },
  );

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <nav className="mb-3 text-xs text-slate-500">
        <Link href={`/${locale}/admin`} className="hover:text-brand-700">
          {t('breadcrumbAdmin')}
        </Link>
        <span className="mx-1.5">›</span>
        <span>{t('title')}</span>
      </nav>
      <header className="-mx-6 overflow-hidden rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-3 mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{t('title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
        </div>
        <form className="flex items-center gap-2">
          <label className="text-xs text-slate-500">{t('year')}</label>
          <select
            name="year"
            defaultValue={currentYearId ?? ''}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.label}
                {y.active ? ' ★' : ''}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs hover:bg-slate-50"
          >
            {t('apply')}
          </button>
        </form>
      </header>

      {!currentYearId ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          {t('noYear')}
        </div>
      ) : classes.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          {t('noClasses')}
        </div>
      ) : (
        <GenerateGlobalForm
          locale={locale}
          academicYearId={currentYearId}
          classes={classes.map((c) => ({
            id: c.id,
            name: c.name,
            levelLabel: c.level.label,
            assignmentCount: c._count.teacherAssignments,
            entryCount: c._count.timetableEntries,
          }))}
        />
      )}
    </div>
  );
}
