import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { pickPeriodId } from '@/lib/periods';
import { computeTeacherDashboard } from '@/lib/kpi-teacher';
import { TeacherDashboardView } from '@/components/teacher-dashboard-view';

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
      select: { firstName: true, lastName: true, type: true },
    });
    if (!teacher || teacher.type !== 'TEACHER') return null;
    const activeYear = await tx.academicYear.findFirst({
      where: { active: true },
      include: { periods: { orderBy: { startDate: 'asc' } } },
    });
    const periods = activeYear?.periods ?? [];
    const selectedPeriodId = pickPeriodId(periods, sp.period);
    const dash = await computeTeacherDashboard(tx, { teacherId: id, periodId: selectedPeriodId });
    return {
      teacher,
      yearLabel: activeYear?.label ?? '—',
      periods: periods.map((p) => ({ id: p.id, label: p.label })),
      selectedPeriodId,
      dash,
    };
  });

  if (!data) notFound();

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <nav className="mb-3 text-xs text-slate-500">
        <Link href={`/${locale}/admin/persons/${id}`} className="hover:text-brand-700">
          {data.teacher.lastName} {data.teacher.firstName}
        </Link>
        <span className="mx-1.5">›</span>
        <span>{t('title')}</span>
      </nav>

      <header className="-mx-6 overflow-hidden rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-3 mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{t('title')}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {data.teacher.lastName} {data.teacher.firstName} · {data.yearLabel}
            {data.dash.subjects.length > 0 && ` · ${data.dash.subjects.join(', ')}`}
          </p>
        </div>
        {data.periods.length > 0 && (
          <form method="get" className="flex items-end gap-2">
            <label className="block">
              <span className="block text-xs text-slate-500">{t('period')}</span>
              <select
                name="period"
                defaultValue={data.selectedPeriodId ?? ''}
                className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm shadow-sm"
              >
                {data.periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              {t('apply')}
            </button>
          </form>
        )}
      </header>

      <TeacherDashboardView dash={data.dash} />
    </div>
  );
}
