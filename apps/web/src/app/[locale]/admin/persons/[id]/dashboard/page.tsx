import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { pickPeriodId, schoolPeriods } from '@/lib/periods';
import { computeTeacherDashboard } from '@/lib/kpi-teacher';
import { TeacherDashboardView } from '@/components/teacher-dashboard-view';
import { PersonHeader, PERSON_PAGE_SHELL } from '../person-header';
import { PeriodButtons } from '@/components/period-buttons';

export default async function TeacherDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { locale, id } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('admin.teacherDashboard');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const teacher = await tx.person.findUnique({
      where: { id },
      select: { firstName: true, lastName: true, firstNameAr: true, lastNameAr: true, type: true },
    });
    if (!teacher || teacher.type !== 'TEACHER') return null;
    const activeYear = await tx.academicYear.findFirst({
      where: { active: true },
      include: { periods: { orderBy: { startDate: 'asc' } } },
    });
    const periods = schoolPeriods(activeYear?.periods ?? []);
    const selectedPeriodId = pickPeriodId(periods, sp.period);
    const dash = await computeTeacherDashboard(tx, { teacherId: id, periodId: selectedPeriodId });
    return {
      teacher,
      yearLabel: activeYear?.label ?? '—',
      periods: periods.map((p) => ({ id: p.id, label: p.label, labelAr: p.labelAr })),
      selectedPeriodId,
      dash,
    };
  });

  if (!data) notFound();

  return (
    <div className={PERSON_PAGE_SHELL}>
      <PersonHeader personId={id} locale={locale} active="dashboard" />

      <header className="-mx-6 overflow-hidden rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-3 mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{t('title')}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {data.yearLabel}
            {data.dash.subjects.length > 0 && ` · ${data.dash.subjects.join(', ')}`}
          </p>
        </div>
        {data.periods.length > 0 && (
          <PeriodButtons periods={data.periods} selectedId={data.selectedPeriodId} locale={locale} />
        )}
      </header>

      <TeacherDashboardView dash={data.dash} />
    </div>
  );
}
