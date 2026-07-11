import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { computeKpis } from '@/lib/kpi-edt';
import { loadSubjectCoverage } from '@/lib/subject-coverage';
import {
  CircularGauge,
  CoherenceCard,
  ConflictsCard,
  ForecastCoverageCard,
  HorizontalBars,
  ScheduleCard,
  ScoreCard,
  TeacherAvailabilityCard,
  TeacherLoadCard,
  PedagogicalCard,
  UtilizationCard,
} from './dashboard-cards';

export default async function TimetableDashboardPage({
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
  const t = await getTranslations('admin.timetableDashboard');

  const { years, currentYearId, kpis, subjectCoverage } = await withTenant(session.user.tenantId, async (tx) => {
    const years = await tx.academicYear.findMany({
      orderBy: { startDate: 'desc' },
      select: { id: true, label: true, active: true },
    });
    const activeYear = years.find((y) => y.active);
    const currentYearId = sp.year ?? activeYear?.id ?? years[0]?.id ?? null;

    if (!currentYearId) {
      return { years, currentYearId: null, kpis: null, subjectCoverage: [] };
    }
    const kpis = await computeKpis(tx, session.user.tenantId, currentYearId);
    const subjectCoverage = await loadSubjectCoverage(tx, currentYearId);
    return { years, currentYearId, kpis, subjectCoverage };
  });

  return (
    <div className="px-3 py-3">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 overflow-hidden rounded-3xl bg-gradient-to-r from-brand-100 to-brand-50 px-4 py-2.5">
        <div>
          <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-slate-600">{t('subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          <Link
            href={`/${locale}/admin/settings/timetable-slots`}
            className="text-brand-700 text-xs hover:underline"
          >
            {t('manageSlots')}
          </Link>
          <Link
            href={`/${locale}/admin/settings/timetable-settings`}
            className="text-brand-700 text-xs hover:underline"
          >
            {t('manageSettings')}
          </Link>
        </div>
      </header>

      {!kpis ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          {t('noData')}
        </div>
      ) : (
        <>
          {/* Score global + couverture en haut */}
          <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <CircularGauge
              label={t('coverage.title')}
              value={kpis.coverageHours.contractual}
              max={kpis.coverageHours.expected}
              pct={kpis.coverageHours.pct}
              unit="h"
              hint={t('coverage.hint', {
                contractual: kpis.coverageHours.contractual,
                expected: kpis.coverageHours.expected,
              })}
              alert={
                kpis.coverageHours.teachersWithoutContractual > 0
                  ? t('coverage.warningMissing', {
                      count: kpis.coverageHours.teachersWithoutContractual,
                      total: kpis.coverageHours.totalTeachers,
                    })
                  : null
              }
            />

            <ForecastCoverageCard
              contractual={kpis.forecastCoverage.contractual}
              programHours={kpis.forecastCoverage.programHours}
              utilizationPct={kpis.forecastCoverage.utilizationPct}
              t={t}
            />

            <UtilizationCard
              expected={kpis.utilizationRate.expected}
              contractual={kpis.utilizationRate.contractual}
              pct={kpis.utilizationRate.pct}
              t={t}
            />

            <ScoreCard score={kpis.globalScore} t={t} />

            <CoherenceCard
              subjectsWithoutTeacher={kpis.matterCoherence.subjectsWithoutTeacher}
              teachersWithoutAssignment={kpis.matterCoherence.teachersWithoutAssignment}
              duplicates={kpis.matterCoherence.duplicateAssignments}
              t={t}
            />
          </div>

          {/* Cards milieu */}
          <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <HorizontalBars
              title={t('rooms.title')}
              bars={[
                {
                  label: t('rooms.classes', { count: kpis.classRooms.classes }),
                  value: kpis.classRooms.classes,
                  max: Math.max(kpis.classRooms.classes, kpis.classRooms.rooms),
                  color:
                    kpis.classRooms.okPct >= 100
                      ? 'emerald'
                      : kpis.classRooms.okPct >= 80
                        ? 'amber'
                        : 'red',
                },
                {
                  label: t('rooms.available', { count: kpis.classRooms.rooms }),
                  value: kpis.classRooms.rooms,
                  max: Math.max(kpis.classRooms.classes, kpis.classRooms.rooms),
                  color: 'blue',
                },
                ...kpis.specializedRooms
                  .filter((s) => s.type !== 'STD' && s.needed > 0)
                  .map((s) => ({
                    label: t(`rooms.types.${s.type}`, {
                      available: s.available,
                      needed: s.needed,
                    }),
                    value: s.available,
                    max: Math.max(
                      1,
                      Math.ceil(
                        s.needed /
                          ((kpis.schedule.daysActive * kpis.schedule.slotsPlaceable) / 100),
                      ),
                    ),
                    color: (s.surchargePct > 0 ? 'red' : 'emerald') as 'red' | 'emerald' | 'amber',
                  })),
              ]}
            />

            <TeacherAvailabilityCard
              totalTeachers={kpis.teacherAvailability.totalTeachers}
              empty={kpis.teacherAvailability.teachersWithEmptyAvailability}
              emptyList={kpis.teacherAvailability.teachersWithEmptyList}
              noSpecialtyList={kpis.teacherAvailability.teachersWithoutSpecialtyList}
              sharedRoomList={kpis.teacherAvailability.teachersSharingRoomList}
              uncovered={kpis.teacherAvailability.uncoveredSlots}
              uncoveredCells={kpis.teacherAvailability.uncoveredCells}
              avg={kpis.teacherAvailability.avgTeachersPerSlot}
              t={t}
            />

            <ConflictsCard
              teacher={kpis.conflicts.teacher}
              room={kpis.conflicts.room}
              cls={kpis.conflicts.class}
              teacherList={kpis.conflicts.teacherList}
              roomList={kpis.conflicts.roomList}
              classList={kpis.conflicts.classList}
              t={t}
            />
          </div>

          {/* Cards bas */}
          <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TeacherLoadCard
              overloaded={kpis.teacherLoad.overloaded}
              underloaded={kpis.teacherLoad.underloaded}
              ok={kpis.teacherLoad.ok}
              distribution={kpis.teacherLoad.distribution.slice(0, 8)}
              t={t}
            />

            <div className="space-y-4">
              <ScheduleCard
                slotsTotal={kpis.schedule.slotsTotal}
                slotsPlaceable={kpis.schedule.slotsPlaceable}
                breaks={kpis.schedule.breaks}
                daysActive={kpis.schedule.daysActive}
                ok={kpis.schedule.ok}
                t={t}
              />
              <PedagogicalCard
                overloaded={kpis.pedagogicalConstraints.classesOverloaded}
                ok={kpis.pedagogicalConstraints.classesOk}
                avg={kpis.pedagogicalConstraints.avgWeeklyHours}
                t={t}
              />
            </div>
          </div>

          {/* Indicateur salles spécialisées : capacité (séances/sem) vs séances requises */}
          <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
              <h2 className="text-sm font-semibold text-slate-700">{t('roomCapacity.title')}</h2>
              <p className="text-[11px] text-slate-500">{t('roomCapacity.hint')}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-4 py-2 text-start">{t('roomCapacity.roomType')}</th>
                    <th className="px-4 py-2 text-end">{t('roomCapacity.rooms')}</th>
                    <th className="px-4 py-2 text-end">{t('roomCapacity.capacity')}</th>
                    <th className="px-4 py-2 text-end">{t('roomCapacity.needed')}</th>
                    <th className="px-4 py-2 text-end">{t('roomCapacity.gap')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {kpis.specializedRooms.map((s) => {
                    // Capacité = salles × cellules réellement plaçables (demi-journées incluses).
                    const capacity = s.available * kpis.schedule.placeableCells;
                    const gap = capacity - s.needed;
                    return (
                      <tr key={s.type}>
                        <td className="px-4 py-2 font-medium text-slate-800">
                          {t(`roomCapacity.types.${s.type}`)}
                        </td>
                        <td className="px-4 py-2 text-end tabular-nums text-slate-600">{s.available}</td>
                        <td className="px-4 py-2 text-end tabular-nums text-slate-600">{capacity}</td>
                        <td className="px-4 py-2 text-end tabular-nums text-slate-600">{s.needed}</td>
                        <td className="px-4 py-2 text-end tabular-nums font-semibold">
                          <span
                            className={gap < 0 ? 'text-red-700' : gap === 0 ? 'text-amber-700' : 'text-emerald-700'}
                          >
                            {gap > 0 ? '+' : ''}
                            {gap}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Couverture horaire par matière : programme vs profs disponibles */}
          <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
              <h2 className="text-sm font-semibold text-slate-700">{t('subjectCoverage.title')}</h2>
              <p className="text-[11px] text-slate-500">{t('subjectCoverage.hint')}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-4 py-2 text-start">{t('subjectCoverage.subject')}</th>
                    <th className="px-4 py-2 text-end">{t('subjectCoverage.demand')}</th>
                    <th className="px-4 py-2 text-end">{t('subjectCoverage.teachers')}</th>
                    <th className="px-4 py-2 text-end">{t('subjectCoverage.supply')}</th>
                    <th className="px-4 py-2 text-end">{t('subjectCoverage.gap')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {subjectCoverage.map((r) => (
                    <tr key={r.subjectId}>
                      <td className="px-4 py-2 font-medium text-slate-800">{r.label}</td>
                      <td className="px-4 py-2 text-end tabular-nums text-slate-600">{r.demandHours} h</td>
                      <td className="px-4 py-2 text-end tabular-nums text-slate-600">{r.teacherCount}</td>
                      <td className="px-4 py-2 text-end tabular-nums text-slate-600">{r.supplyHours} h</td>
                      <td className="px-4 py-2 text-end tabular-nums font-semibold">
                        <span
                          className={
                            r.gap < 0 ? 'text-red-700' : r.gap === 0 ? 'text-amber-700' : 'text-emerald-700'
                          }
                        >
                          {r.gap > 0 ? '+' : ''}
                          {r.gap} h
                        </span>
                      </td>
                    </tr>
                  ))}
                  {subjectCoverage.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-xs text-slate-400">
                        {t('subjectCoverage.empty')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Bouton générer en bas, centré */}
          <div className="flex justify-center">
            <Link
              href={`/${locale}/admin/timetable/generate${currentYearId ? `?year=${currentYearId}` : ''}`}
              className="rounded-xl bg-emerald-600 px-8 py-3 text-base font-medium text-white shadow hover:bg-emerald-700"
            >
              ✨ {t('generateButton')}
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
