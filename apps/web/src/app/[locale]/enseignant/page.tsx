import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getTeacherPersonId } from '@/lib/teacher';
import { computeTeacherDashboard, computeClassProgression } from '@/lib/kpi-teacher';
import { TeacherDashboardView } from '@/components/teacher-dashboard-view';
import { ProgressionClassSelect } from './progression-class-select';

export default async function TeacherHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ period?: string; class?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('admin.teacherDashboard');
  const tNav = await getTranslations('enseignant');

  const tenantTz = (await withTenant(session.user.tenantId, (tx) =>
    tx.tenant.findFirst({ select: { timezone: true } }),
  ))?.timezone || 'Africa/Casablanca';

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const teacherId = await getTeacherPersonId(tx, session.user.id);
    const activeYear = await tx.academicYear.findFirst({
      where: { active: true },
      include: { periods: { orderBy: { startDate: 'asc' } } },
    });
    const periods = activeYear?.periods ?? [];
    const selectedPeriodId = sp.period ?? periods[0]?.id ?? null;
    const dash = teacherId
      ? await computeTeacherDashboard(tx, { teacherId, periodId: selectedPeriodId, tz: tenantTz })
      : null;

    // Classes du prof (id + nom) pour le tableau de progression.
    const assigns = teacherId && activeYear
      ? await tx.teacherAssignment.findMany({
          where: { teacherId, academicYearId: activeYear.id },
          select: { classId: true, class: { select: { name: true } } },
        })
      : [];
    const classesList = [...new Map(assigns.map((a) => [a.classId, a.class.name])).entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const selectedClassId = classesList.find((c) => c.id === sp.class)?.id ?? classesList[0]?.id ?? null;
    const progression =
      teacherId && selectedClassId
        ? await computeClassProgression(tx, teacherId, selectedClassId)
        : { periods: [], rows: [] };

    return {
      hasTeacher: !!teacherId,
      yearLabel: activeYear?.label ?? '—',
      periods: periods.map((p) => ({ id: p.id, label: p.label })),
      selectedPeriodId,
      dash,
      classesList,
      selectedClassId,
      progression,
    };
  });

  return (
    <div className="px-3 py-3">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-3xl bg-gradient-to-r from-[#e8edff] to-[#eef0ff] px-4 py-2.5">
        <div>
          <h1 className="text-base font-bold text-slate-900">{tNav('home.title')}</h1>
          <p className="mt-0.5 text-sm text-slate-600">
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

      {/* Progression trimestrielle des élèves */}
      {data.hasTeacher && data.classesList.length > 0 && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-700">🔸 {t('progressionTable.title')}</h2>
            <ProgressionClassSelect classes={data.classesList} selectedClassId={data.selectedClassId} />
          </div>
          <ProgressionTable progression={data.progression} t={t} />
        </section>
      )}
    </div>
  );
}

function ProgressionTable({
  progression,
  t,
}: {
  progression: { periods: { id: string; label: string }[]; rows: { studentId: string; name: string; byPeriod: (number | null)[] }[] };
  t: (k: string) => string;
}) {
  const { periods, rows } = progression;
  if (rows.length === 0) {
    return <p className="text-xs italic text-slate-400">{t('progressionTable.empty')}</p>;
  }
  // Colonnes de progression : paires consécutives + (1ère, dernière) si > 2 périodes.
  const pairs: [number, number][] = [];
  for (let i = 0; i + 1 < periods.length; i++) pairs.push([i, i + 1]);
  if (periods.length > 2) pairs.push([0, periods.length - 1]);

  const diff = (a: number | null, b: number | null): number | null =>
    a === null || b === null ? null : b - a;
  const cell = (v: number | null) => (v === null ? '—' : v.toFixed(1));
  const trend = (v: number | null) => {
    if (v === null) return <span className="text-slate-300">—</span>;
    const cls = v > 0 ? 'text-emerald-600' : v < 0 ? 'text-red-600' : 'text-slate-500';
    return <span className={`font-semibold tabular-nums ${cls}`}>{v >= 0 ? '+' : ''}{v.toFixed(1)}</span>;
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-3 py-2 text-start">{t('progressionTable.student')}</th>
            {periods.map((p) => (
              <th key={p.id} className="px-3 py-2 text-end">{p.label}</th>
            ))}
            {pairs.map(([a, b]) => (
              <th key={`${a}-${b}`} className="px-3 py-2 text-end">
                {periods[a]!.label} → {periods[b]!.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.studentId}>
              <td className="px-3 py-2 font-medium text-slate-800">{r.name}</td>
              {r.byPeriod.map((v, i) => (
                <td key={i} className="px-3 py-2 text-end tabular-nums text-slate-700">{cell(v)}</td>
              ))}
              {pairs.map(([a, b]) => (
                <td key={`${a}-${b}`} className="px-3 py-2 text-end">
                  {trend(diff(r.byPeriod[a] ?? null, r.byPeriod[b] ?? null))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
