import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { computeKpis } from '@/lib/kpi-edt';
import {
  CircularGauge,
  CoherenceCard,
  ConflictsCard,
  HorizontalBars,
  ScheduleCard,
  ScoreCard,
  TeacherAvailabilityCard,
  TeacherLoadCard,
  PedagogicalCard,
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

  const { years, currentYearId, kpis } = await withTenant(
    session.user.tenantId,
    async (tx) => {
      const years = await tx.academicYear.findMany({
        orderBy: { startDate: 'desc' },
        select: { id: true, label: true, active: true },
      });
      const activeYear = years.find((y) => y.active);
      const currentYearId = sp.year ?? activeYear?.id ?? years[0]?.id ?? null;

      if (!currentYearId) {
        return { years, currentYearId: null, kpis: null };
      }
      const kpis = await computeKpis(tx, session.user.tenantId, currentYearId);
      return { years, currentYearId, kpis };
    },
  );

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{t('title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
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
            className="text-xs text-brand-700 hover:underline"
          >
            {t('manageSlots')}
          </Link>
          <Link
            href={`/${locale}/admin/settings/timetable-settings`}
            className="text-xs text-brand-700 hover:underline"
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
          {/* Score global en haut */}
          <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <CircularGauge
              label={t('coverage.title')}
              value={kpis.coverageHours.available}
              max={kpis.coverageHours.expected}
              pct={kpis.coverageHours.pct}
              unit="h"
              hint={t('coverage.hint', {
                available: kpis.coverageHours.available,
                expected: kpis.coverageHours.expected,
              })}
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
                    max: Math.max(1, Math.ceil(s.needed / (kpis.schedule.daysActive * kpis.schedule.slotsPlaceable / 100))),
                    color: (s.surchargePct > 0 ? 'red' : 'emerald') as
                      | 'red'
                      | 'emerald'
                      | 'amber',
                  })),
              ]}
            />

            <TeacherAvailabilityCard
              totalTeachers={kpis.teacherAvailability.totalTeachers}
              empty={kpis.teacherAvailability.teachersWithEmptyAvailability}
              uncovered={kpis.teacherAvailability.uncoveredSlots}
              avg={kpis.teacherAvailability.avgTeachersPerSlot}
              t={t}
            />

            <ConflictsCard
              teacher={kpis.conflicts.teacher}
              room={kpis.conflicts.room}
              cls={kpis.conflicts.class}
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
