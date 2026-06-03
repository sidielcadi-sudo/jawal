import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getTeacherPersonId } from '@/lib/teacher';
import { computeTeacherDashboard } from '@/lib/kpi-teacher';
import { TeacherDashboardView } from '@/components/teacher-dashboard-view';

export default async function TeacherHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('admin.teacherDashboard');
  const tNav = await getTranslations('enseignant');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const teacherId = await getTeacherPersonId(tx, session.user.id);
    const activeYear = await tx.academicYear.findFirst({
      where: { active: true },
      include: { periods: { orderBy: { startDate: 'asc' } } },
    });
    const periods = activeYear?.periods ?? [];
    const selectedPeriodId = sp.period ?? periods[0]?.id ?? null;
    const dash = teacherId
      ? await computeTeacherDashboard(tx, { teacherId, periodId: selectedPeriodId })
      : null;
    return {
      hasTeacher: !!teacherId,
      yearLabel: activeYear?.label ?? '—',
      periods: periods.map((p) => ({ id: p.id, label: p.label })),
      selectedPeriodId,
      dash,
    };
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{tNav('home.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {data.yearLabel}
            {data.dash && data.dash.subjects.length > 0 && ` · ${data.dash.subjects.join(', ')}`}
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

      {data.dash ? (
        <TeacherDashboardView dash={data.dash} />
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          {tNav('home.noTeacher')}
        </div>
      )}
    </div>
  );
}
