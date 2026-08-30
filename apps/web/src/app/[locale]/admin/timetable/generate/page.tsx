import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { GenerateGlobalForm } from './form';
import { localizedLabel } from '@/lib/localized-name';

export default async function GenerateGlobalPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = (await auth())!;
  const t = await getTranslations('admin.timetable.generateMulti');

  const { activeYear, currentYearId, classes } = await withTenant(
    session.user.tenantId,
    async (tx) => {
      const activeYear = await tx.academicYear.findFirst({
        where: { active: true },
        select: { id: true, label: true, startDate: true, endDate: true },
      });
      const currentYearId = activeYear?.id ?? null;

      const classes = currentYearId
        ? await tx.class.findMany({
            where: { academicYearId: currentYearId, deletedAt: null },
            include: {
              level: { select: { label: true, labelAr: true } },
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

      return { activeYear, currentYearId, classes };
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
          <p className="mt-1 text-sm text-slate-500">
            {t('subtitle')}
            {activeYear &&
              ` · ${activeYear.label} (${activeYear.startDate.toLocaleDateString(locale)} → ${activeYear.endDate.toLocaleDateString(locale)})`}
          </p>
        </div>
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
            name: localizedLabel(locale, c.name, c.nameAr),
            levelLabel: localizedLabel(locale, c.level.label, c.level.labelAr),
            assignmentCount: c._count.teacherAssignments,
            entryCount: c._count.timetableEntries,
          }))}
        />
      )}
    </div>
  );
}
