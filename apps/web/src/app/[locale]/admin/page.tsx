import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import {
  computeHeadcount,
  computeAcademicOverview,
  computeAttendanceRate,
  findAtRiskStudents,
} from '@/lib/bi';
import { listContractAlerts } from '@/lib/contract-alerts';
import { contractStatusBadgeClass } from '@/lib/contract-status';
import { isDirection, isVieScolaireOnly as checkVieScolaireOnly } from '@/lib/auth/rbac';
import { computePilotage, type Kpi, type KpiStatus } from '@/lib/kpi-pilotage';
import { ContractAlertsActions } from './contract-alerts-actions';
import { DashboardTabs } from './dashboard-tabs';
import { PeriodSelect } from './period-select';
import { TeacherKpisSection } from './teacher-kpis-section';

export default async function AdminDashboard({
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
  const tenantId = session.user.tenantId;

  // La page Pilotage est réservée à la direction/admin. Les utilisateurs vie
  // scolaire (CPE, hors direction) ont pour tableau de bord le Cockpit vie
  // scolaire (2 onglets Cockpit + Journalier), sans page Pilotage.
  const isVieScolaireOnly = await checkVieScolaireOnly();
  if (isVieScolaireOnly) redirect(`/${locale}/admin/vie-scolaire`);

  const t = await getTranslations('admin.dashboard');

  const data = await withTenant(tenantId, async (tx) => {
    const activeYear = await tx.academicYear.findFirst({
      where: { active: true },
      include: { periods: { orderBy: { startDate: 'asc' } } },
    });
    const periods = activeYear?.periods ?? [];

    // Période sélectionnée : ?period=… si valide, sinon le trimestre courant
    // (par date du jour). Hors période (vacances / fin d'année), on retombe sur
    // le DERNIER trimestre déjà commencé (ex. juillet → T3), sinon le premier.
    const now = new Date();
    const currentPeriod = periods.find((p) => p.startDate <= now && now <= p.endDate);
    const startedPeriods = periods.filter((p) => p.startDate <= now);
    const fallbackPeriod = startedPeriods[startedPeriods.length - 1] ?? periods[0] ?? null;
    const requested = sp.period && periods.some((p) => p.id === sp.period) ? sp.period : null;
    const selectedPeriod =
      periods.find((p) => p.id === requested) ?? currentPeriod ?? fallbackPeriod;
    const periodId = selectedPeriod?.id ?? null;

    const [headcount, academic, attendance, atRisk] = await Promise.all([
      computeHeadcount(tx),
      periodId
        ? computeAcademicOverview(tx, periodId)
        : Promise.resolve({
            studentsRated: 0,
            averageGeneral: null,
            successRate: null,
            topClasses: [] as Array<{ classId: string; name: string; average: number }>,
            bottomClasses: [] as Array<{ classId: string; name: string; average: number }>,
          }),
      periodId
        ? computeAttendanceRate(tx, periodId)
        : Promise.resolve({
            rate: null,
            totalRecords: 0,
            presentCount: 0,
            absentCount: 0,
            lateCount: 0,
            excusedCount: 0,
          }),
      periodId ? findAtRiskStudents(tx, periodId) : Promise.resolve([]),
    ]);

    // Finance quick — agrégation côté base (évite de charger toutes les lignes).
    const [dueAgg, paidAgg] = await Promise.all([
      tx.installment.aggregate({ _sum: { amount: true }, where: { status: { not: 'CANCELLED' } } }),
      tx.payment.aggregate({ _sum: { amount: true } }),
    ]);
    const totalDue = Number(dueAgg._sum.amount ?? 0);
    const totalPaid = Number(paidAgg._sum.amount ?? 0);
    const finance = {
      totalDue,
      totalPaid,
      totalRemaining: Math.max(0, totalDue - totalPaid),
    };

    // KPI de pilotage (taux de réussite, absentéisme, charge prof, satisfaction,
    // conformité Massar, moyennes par niveau) — fusionnés dans « Vue d'ensemble ».
    const pilotage = periodId ? await computePilotage(tx, periodId) : null;

    const tenant = await tx.tenant.findFirst();
    return {
      yearLabel: activeYear?.label ?? '—',
      periodLabel: selectedPeriod?.label ?? '—',
      periods: periods.map((p) => ({ id: p.id, label: p.label })),
      selectedPeriodId: periodId,
      headcount,
      academic,
      attendance,
      atRisk,
      finance,
      pilotage,
      currency: tenant?.currency ?? 'MAD',
    };
  });

  const contractAlerts = await listContractAlerts(tenantId);
  const tContract = await getTranslations('admin.persons.detail');
  const tAlerts = await getTranslations('admin.dashboard.contractAlerts');
  const tp = await getTranslations('admin.pilotage');
  const direction = await isDirection();

  // « Vue d'ensemble » : cartes générales (tous les admins) + cartes de pilotage
  // (direction seulement), toutes au design des cartes pilotage. Le Recouvrement
  // n'apparaît qu'une fois (carte générale ci-dessous), pas en double.
  const overviewCards: Array<{
    key: string;
    label: string;
    value: string;
    status: KpiStatus;
    thresholds?: { green: string; orange: string; red: string };
  }> = [
    {
      key: 'totalDue',
      label: t('kpi.totalDue'),
      value: `${data.finance.totalDue.toLocaleString(locale)} ${data.currency}`,
      status: 'na',
    },
    {
      key: 'collected',
      label: t('kpi.collected'),
      value: `${data.finance.totalPaid.toLocaleString(locale)} ${data.currency}`,
      status: 'na',
    },
    {
      key: 'toCollect',
      label: t('kpi.toCollect'),
      value: `${data.finance.totalRemaining.toLocaleString(locale)} ${data.currency}`,
      status: data.finance.totalRemaining > 0 ? 'orange' : 'green',
    },
    {
      key: 'students',
      label: t('kpi.students'),
      value: String(data.headcount.students),
      status: 'na',
    },
    {
      key: 'averageGeneral',
      label: t('kpi.averageGeneral'),
      value: data.academic.averageGeneral !== null ? data.academic.averageGeneral.toFixed(2) : '—',
      status: colorToStatus(getAcademicColor(data.academic.averageGeneral)),
    },
    {
      key: 'attendanceRate',
      label: t('kpi.attendanceRate'),
      value: data.attendance.rate !== null ? `${data.attendance.rate.toFixed(1)}%` : '—',
      status: colorToStatus(getAttendanceColor(data.attendance.rate)),
    },
    {
      key: 'collection',
      label: t('kpi.collectionRate'),
      value:
        data.finance.totalDue > 0
          ? `${((data.finance.totalPaid / data.finance.totalDue) * 100).toFixed(1)}%`
          : '—',
      status: colorToStatus(getCollectionColor(data.finance.totalPaid, data.finance.totalDue)),
      thresholds: THRESHOLDS.collection,
    },
  ];
  if (direction && data.pilotage) {
    const p = data.pilotage;
    overviewCards.push(
      { key: 'successRate', label: tp('kpi.successRate'), value: formatKpi(p.successRate), status: p.successRate.status, thresholds: THRESHOLDS.successRate },
      { key: 'absenteeism', label: tp('kpi.absenteeism'), value: formatKpi(p.absenteeism), status: p.absenteeism.status, thresholds: THRESHOLDS.absenteeism },
      { key: 'teacherLoad', label: tp('kpi.teacherLoad'), value: formatKpi(p.teacherLoad), status: p.teacherLoad.status, thresholds: THRESHOLDS.teacherLoad },
      { key: 'satisfaction', label: tp('kpi.satisfaction'), value: formatKpi(p.satisfaction), status: p.satisfaction.status, thresholds: THRESHOLDS.satisfaction },
      { key: 'conformiteMassar', label: tp('kpi.conformiteMassar'), value: formatKpi(p.conformiteMassar), status: p.conformiteMassar.status },
    );
  }

  return (
    <div className="px-3 py-3">
      <header className="mb-4 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">{t('bandTitle')}</h1>
      </header>
      <div className="mb-4">
        <DashboardTabs locale={locale} showPilotage={!isVieScolaireOnly} />
      </div>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <div>
          <h2 className="text-base font-bold text-slate-900">{t('title')}</h2>
          <p className="mt-0.5 text-sm text-slate-600">
            {data.yearLabel} · {data.periodLabel}
          </p>
        </div>
        {data.periods.length > 0 && (
          <PeriodSelect periods={data.periods} selectedPeriodId={data.selectedPeriodId} />
        )}
      </header>

      {/* Vue d'ensemble — cartes générales + pilotage (direction), design pilotage.
          Le Pilotage est fusionné ici ; Recouvrement n'apparaît qu'une fois. */}
      <Category label={t('cat.overview')}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {overviewCards.map((c) => (
            <PilotCard
              key={c.key}
              label={c.label}
              value={c.value}
              status={c.status}
              thresholds={c.thresholds}
            />
          ))}
        </div>
      </Category>

      {/* Réussite scolaire */}
      <Category label={t('cat.success')} defaultOpen={false}>
        <div className="grid grid-cols-1 gap-6">
        {/* Top/bottom classes */}
        <section>
          <h2 className="mb-3 text-base font-semibold text-slate-900">{t('academic.title')}</h2>
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm p-5">
            {data.academic.topClasses.length === 0 ? (
              <p className="text-sm text-slate-500">{t('academic.empty')}</p>
            ) : (
              <>
                <h3 className="text-xs uppercase tracking-wide text-slate-500">
                  {t('academic.topClasses')}
                </h3>
                <ul className="mt-2 space-y-1.5">
                  {data.academic.topClasses.map((c, i) => (
                    <li key={c.classId} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span className="text-slate-400">#{i + 1}</span>
                        <Link
                          href={`/${locale}/admin/classes/${c.classId}`}
                          className="text-slate-900 hover:text-brand-700 hover:underline"
                        >
                          {c.name}
                        </Link>
                      </span>
                      <span className="font-semibold tabular-nums text-emerald-700">
                        {c.average.toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
                {data.academic.bottomClasses.length > 0 &&
                  data.academic.bottomClasses[0]?.classId !==
                    data.academic.topClasses[0]?.classId && (
                    <>
                      <h3 className="mt-4 text-xs uppercase tracking-wide text-slate-500">
                        {t('academic.bottomClasses')}
                      </h3>
                      <ul className="mt-2 space-y-1.5">
                        {data.academic.bottomClasses.map((c) => (
                          <li key={c.classId} className="flex items-center justify-between text-sm">
                            <Link
                              href={`/${locale}/admin/classes/${c.classId}`}
                              className="text-slate-900 hover:text-brand-700 hover:underline"
                            >
                              {c.name}
                            </Link>
                            <span className="font-semibold tabular-nums text-red-700">
                              {c.average.toFixed(2)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
              </>
            )}
          </div>
        </section>
        {/* Moyennes par niveau — intégrées ici (déplacées depuis Pilotage) */}
        <LevelAverages
          title={tp('kpi.levelAverages')}
          emptyLabel={tp('empty')}
          levels={data.pilotage?.levelAverages ?? []}
        />
        </div>
      </Category>

      {/* Vie scolaire & assiduité */}
      <Category label={t('cat.vieScolaire')} defaultOpen={false}>
      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">{t('attendance.title')}</h2>
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm p-5">
            {data.attendance.totalRecords === 0 ? (
              <p className="text-sm text-slate-500">{t('attendance.empty')}</p>
            ) : (
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <Counter
                  label={t('attendance.present')}
                  value={
                    data.attendance.presentCount -
                    data.attendance.lateCount -
                    data.attendance.excusedCount
                  }
                  color="emerald"
                />
                <Counter
                  label={t('attendance.absent')}
                  value={data.attendance.absentCount}
                  color="red"
                />
                <Counter
                  label={t('attendance.late')}
                  value={data.attendance.lateCount}
                  color="amber"
                />
                <Counter
                  label={t('attendance.excused')}
                  value={data.attendance.excusedCount}
                  color="blue"
                />
              </div>
            )}
          </div>
      </section>
      </Category>

      {/* Effectifs & structure */}
      <Category label={t('cat.effectifs')} defaultOpen={false}>
      <section>
          <h2 className="mb-3 text-base font-semibold text-slate-900">
            {t('headcount.title')}
          </h2>
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm p-5 text-sm">
            <Row label={t('headcount.totalEnrolled')} value={String(data.headcount.totalEnrolled)} />
            <Row label={t('headcount.totalCapacity')} value={String(data.headcount.totalCapacity)} />
            <Row
              label={t('headcount.occupancyRate')}
              value={`${data.headcount.occupancyRate.toFixed(1)}%`}
            />
            <Row label={t('headcount.staff')} value={String(data.headcount.staff)} />
            <Row label={t('headcount.parents')} value={String(data.headcount.parents)} />
          </div>
        </section>

      {/* Élèves à risque — intégré dans Effectifs & structures */}
      <section className="mt-6">
        <h2 className="mb-3 text-base font-semibold text-slate-900">
          {t('atRisk.title')}{' '}
          <span className="ms-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
            {data.atRisk.length}
          </span>
        </h2>
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
              <tr>
                <th className="px-4 py-3 text-start">{t('atRisk.student')}</th>
                <th className="px-4 py-3 text-start">{t('atRisk.class')}</th>
                <th className="px-4 py-3 text-end">{t('atRisk.absenceRate')}</th>
                <th className="px-4 py-3 text-end">{t('atRisk.average')}</th>
                <th className="px-4 py-3 text-start">{t('atRisk.reasons')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.atRisk.map((s) => (
                <tr key={s.studentId}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/${locale}/admin/persons/${s.studentId}`}
                      className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                    >
                      {s.lastName} {s.firstName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {s.className && s.classId ? (
                      <Link
                        href={`/${locale}/admin/classes/${s.classId}`}
                        className="text-slate-600 hover:text-brand-700"
                      >
                        {s.className}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">
                    {s.absenceRate !== null ? (
                      <span className={s.absenceRate >= 15 ? 'text-red-700' : 'text-slate-700'}>
                        {s.absenceRate.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">
                    {s.averageGrade !== null ? (
                      <span className={s.averageGrade < 10 ? 'text-red-700' : 'text-slate-700'}>
                        {s.averageGrade.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {s.reasons.includes('absence') && (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
                          {t('atRisk.reasonAbsence')}
                        </span>
                      )}
                      {s.reasons.includes('grade') && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                          {t('atRisk.reasonGrade')}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {data.atRisk.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-emerald-700">
                    ✓ {t('atRisk.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      </Category>

      {/* RH / Enseignants */}
      <Category label={t('cat.rh')} defaultOpen={false}>
      <TeacherKpisSection periodId={data.selectedPeriodId} />

      {contractAlerts.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-900">
            {tAlerts('title')}{' '}
            <span className="rounded bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
              {contractAlerts.length}
            </span>
          </h2>
          <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
                <tr>
                  <th className="px-4 py-3 text-start">{tAlerts('table.name')}</th>
                  <th className="px-4 py-3 text-start">{tAlerts('table.type')}</th>
                  <th className="px-4 py-3 text-start">{tAlerts('table.contractType')}</th>
                  <th className="px-4 py-3 text-start">{tAlerts('table.endDate')}</th>
                  <th className="px-4 py-3 text-end">{tAlerts('table.status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {contractAlerts.map((a) => (
                  <tr key={a.personId}>
                    <td className="px-4 py-3">
                      <Link
                        href={`/${locale}/admin/persons/${a.personId}`}
                        className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                      >
                        {a.lastName} {a.firstName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {tAlerts(`type.${a.type}` as never)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {a.contractType ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">
                      {a.endDate.toISOString().slice(0, 10)}
                    </td>
                    <td className="px-4 py-3 text-end">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${contractStatusBadgeClass(a.bucket)}`}
                      >
                        {tContract(`contractStatus.${a.bucket}` as never)}
                        {a.bucket !== 'EXPIRED'
                          ? ` (${tContract('inDays', { days: a.daysToEnd })})`
                          : ` (${tContract('daysAgo', { days: -a.daysToEnd })})`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex items-center justify-end">
            <ContractAlertsActions locale={locale} />
          </div>
        </section>
      )}
      </Category>

      <section className="mt-6 flex flex-wrap gap-3">
        <Link
          href={`/${locale}/admin/exports`}
          className="rounded-xl bg-gradient-to-r from-blue-600 to-blue-800 px-4 py-2 text-sm font-medium text-white shadow-sm transition-shadow hover:shadow-md"
        >
          📥 {t('actions.exports')}
        </Link>
      </section>
    </div>
  );
}

/** Catégorie pliable/dépliable (dépliée par défaut) — `<details>` natif. */
function Category({
  label,
  children,
  defaultOpen = true,
}: {
  label: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="group mt-8 first:mt-0">
      <summary className="mb-3 flex cursor-pointer list-none items-center gap-2 border-s-4 border-brand-500 ps-3 text-lg font-bold text-slate-900 [&::-webkit-details-marker]:hidden">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-slate-400 transition-transform group-open:rotate-90"
          aria-hidden="true"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
        {label}
      </summary>
      {children}
    </details>
  );
}

const THRESHOLDS: Record<string, { green: string; orange: string; red: string }> = {
  successRate: { green: '> 80 %', orange: '60–80 %', red: '< 60 %' },
  absenteeism: { green: '< 5 %', orange: '5–10 %', red: '> 10 %' },
  collection: { green: '> 90 %', orange: '80–90 %', red: '< 80 %' },
  teacherLoad: { green: '< 15 h', orange: '15–20 h', red: '> 20 h' },
  levelAverage: { green: '> 12', orange: '10–12', red: '< 10' },
  satisfaction: { green: '> 4/5', orange: '3–4/5', red: '< 3/5' },
};

const STATUS_CARD: Record<KpiStatus, string> = {
  green: 'border-emerald-200 bg-emerald-50',
  orange: 'border-amber-200 bg-amber-50',
  red: 'border-red-200 bg-red-50',
  na: 'border-brand-200 bg-brand-50/40',
};
const STATUS_VALUE: Record<KpiStatus, string> = {
  green: 'text-emerald-700',
  orange: 'text-amber-700',
  red: 'text-red-700',
  na: 'text-slate-700',
};
const STATUS_DOT: Record<KpiStatus, string> = {
  green: 'bg-emerald-500',
  orange: 'bg-amber-500',
  red: 'bg-red-500',
  na: 'bg-slate-300',
};

function colorToStatus(c: 'emerald' | 'amber' | 'red' | undefined): KpiStatus {
  if (c === 'emerald') return 'green';
  if (c === 'amber') return 'orange';
  if (c === 'red') return 'red';
  return 'na';
}

function formatKpi(kpi: Kpi): string {
  if (kpi.value === null) return '—';
  switch (kpi.unit) {
    case '%':
      return `${kpi.value.toFixed(1)} %`;
    case 'h':
      return `${kpi.value.toFixed(1)} h`;
    case '/20':
      return `${kpi.value.toFixed(2)}/20`;
    case '/5':
      return `${kpi.value.toFixed(1)}/5`;
    default:
      return String(kpi.value);
  }
}

/** Carte KPI au design « pilotage » (bordure + fond selon le statut). */
function PilotCard({
  label,
  value,
  status,
  thresholds,
}: {
  label: string;
  value: string;
  status: KpiStatus;
  thresholds?: { green: string; orange: string; red: string };
}) {
  return (
    <div className={`rounded-2xl border p-5 ${STATUS_CARD[status]}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
        <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
      </div>
      <div className={`mt-2 text-3xl font-semibold tabular-nums ${STATUS_VALUE[status]}`}>
        {value}
      </div>
      {thresholds && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-500">
          <span>🟢 {thresholds.green}</span>
          <span>🟠 {thresholds.orange}</span>
          <span>🔴 {thresholds.red}</span>
        </div>
      )}
    </div>
  );
}

/** Moyennes par niveau (barres) — intégré dans « Réussite scolaire ». */
function LevelAverages({
  title,
  emptyLabel,
  levels,
}: {
  title: string;
  emptyLabel: string;
  levels: { levelId: string; label: string; average: number | null; status: KpiStatus }[];
}) {
  const maxLevel = Math.max(1, ...levels.map((l) => l.average ?? 0), 20);
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold text-slate-900">{title}</h2>
      <p className="mb-3 text-[11px] text-slate-500">
        🟢 {THRESHOLDS.levelAverage!.green} · 🟠 {THRESHOLDS.levelAverage!.orange} · 🔴{' '}
        {THRESHOLDS.levelAverage!.red}
      </p>
      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        {levels.length === 0 ? (
          <p className="text-sm text-slate-500">{emptyLabel}</p>
        ) : (
          <ul className="space-y-2.5">
            {levels.map((l) => (
              <li key={l.levelId} className="flex items-center gap-3">
                <span className="w-24 shrink-0 truncate text-sm text-slate-700">{l.label}</span>
                <div className="relative h-5 flex-1 overflow-hidden rounded bg-slate-100">
                  <div
                    className={`h-full ${STATUS_DOT[l.status]}`}
                    style={{ width: `${l.average !== null ? (l.average / maxLevel) * 100 : 0}%` }}
                  />
                </div>
                <span
                  className={`w-16 shrink-0 text-end text-sm font-semibold tabular-nums ${STATUS_VALUE[l.status]}`}
                >
                  {l.average !== null ? `${l.average.toFixed(2)}` : '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Counter({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: 'emerald' | 'red' | 'amber' | 'blue';
}) {
  const colors: Record<string, string> = {
    emerald: 'text-emerald-700',
    red: 'text-red-700',
    amber: 'text-amber-700',
    blue: 'text-blue-700',
  };
  return (
    <div>
      <div className={`text-2xl font-semibold tabular-nums ${colors[color]}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-1 last:border-0">
      <span className="text-slate-700">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function getAcademicColor(avg: number | null): 'emerald' | 'amber' | 'red' | undefined {
  if (avg === null) return undefined;
  if (avg >= 14) return 'emerald';
  if (avg >= 10) return 'amber';
  return 'red';
}

function getAttendanceColor(rate: number | null): 'emerald' | 'amber' | 'red' | undefined {
  if (rate === null) return undefined;
  if (rate >= 95) return 'emerald';
  if (rate >= 90) return 'amber';
  return 'red';
}

function getCollectionColor(paid: number, due: number): 'emerald' | 'amber' | 'red' | undefined {
  if (due === 0) return undefined;
  const rate = (paid / due) * 100;
  if (rate >= 80) return 'emerald';
  if (rate >= 50) return 'amber';
  return 'red';
}
