import Link from 'next/link';
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
import { ContractAlertsActions } from './contract-alerts-actions';

export default async function AdminDashboard({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = (await auth())!;
  const tenantId = session.user.tenantId;
  const t = await getTranslations('admin.dashboard');

  const data = await withTenant(tenantId, async (tx) => {
    const activeYear = await tx.academicYear.findFirst({
      where: { active: true },
      include: { periods: { orderBy: { startDate: 'asc' } } },
    });
    const periodId = activeYear?.periods[0]?.id ?? null;

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

    // Finance quick
    const installments = await tx.installment.findMany({
      where: { status: { not: 'CANCELLED' } },
      select: { amount: true },
    });
    const payments = await tx.payment.findMany({ select: { amount: true } });
    const totalDue = installments.reduce((s, i) => s + Number(i.amount), 0);
    const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
    const finance = {
      totalDue,
      totalPaid,
      totalRemaining: Math.max(0, totalDue - totalPaid),
    };

    const tenant = await tx.tenant.findFirst();
    return {
      yearLabel: activeYear?.label ?? '—',
      periodLabel: activeYear?.periods[0]?.label ?? '—',
      headcount,
      academic,
      attendance,
      atRisk,
      finance,
      currency: tenant?.currency ?? 'MAD',
    };
  });

  const contractAlerts = await listContractAlerts(tenantId);
  const tContract = await getTranslations('admin.persons.detail');
  const tAlerts = await getTranslations('admin.dashboard.contractAlerts');

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {data.yearLabel} · {data.periodLabel}
        </p>
      </header>

      {/* 4 KPI principaux */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label={t('kpi.students')}
          value={String(data.headcount.students)}
          sub={t('kpi.teachersClasses', {
            teachers: data.headcount.teachers,
            classes: data.headcount.classes,
          })}
        />
        <Kpi
          label={t('kpi.averageGeneral')}
          value={
            data.academic.averageGeneral !== null ? data.academic.averageGeneral.toFixed(2) : '—'
          }
          sub={
            data.academic.successRate !== null
              ? t('kpi.successRate', { value: data.academic.successRate.toFixed(0) })
              : t('kpi.noGrades')
          }
          color={getAcademicColor(data.academic.averageGeneral)}
        />
        <Kpi
          label={t('kpi.attendanceRate')}
          value={data.attendance.rate !== null ? `${data.attendance.rate.toFixed(1)}%` : '—'}
          sub={t('kpi.attendanceRecords', { count: data.attendance.totalRecords })}
          color={getAttendanceColor(data.attendance.rate)}
        />
        <Kpi
          label={t('kpi.collectionRate')}
          value={
            data.finance.totalDue > 0
              ? `${((data.finance.totalPaid / data.finance.totalDue) * 100).toFixed(1)}%`
              : '—'
          }
          sub={t('kpi.remaining', {
            amount: data.finance.totalRemaining.toFixed(0),
            currency: data.currency,
          })}
          color={getCollectionColor(data.finance.totalPaid, data.finance.totalDue)}
        />
      </div>

      {/* 2 colonnes */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Top/bottom classes */}
        <section>
          <h2 className="mb-3 text-base font-semibold text-slate-900">{t('academic.title')}</h2>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
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

        {/* Attendance breakdown + headcount */}
        <section>
          <h2 className="mb-3 text-base font-semibold text-slate-900">{t('attendance.title')}</h2>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
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

          <h2 className="mb-3 mt-6 text-base font-semibold text-slate-900">
            {t('headcount.title')}
          </h2>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm">
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
      </div>

      {/* Élèves à risque */}
      <section className="mt-6">
        <h2 className="mb-3 text-base font-semibold text-slate-900">
          {t('atRisk.title')}{' '}
          <span className="ms-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
            {data.atRisk.length}
          </span>
        </h2>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
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

      {contractAlerts.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-900">
            {tAlerts('title')}{' '}
            <span className="rounded bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
              {contractAlerts.length}
            </span>
          </h2>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
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

      <section className="mt-6 flex flex-wrap gap-3">
        <Link
          href={`/${locale}/admin/exports`}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          📥 {t('actions.exports')}
        </Link>
        <Link
          href={`/${locale}/admin/finance`}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          💰 {t('actions.finance')}
        </Link>
        <Link
          href={`/${locale}/admin/announcements`}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          📢 {t('actions.announcements')}
        </Link>
        <Link
          href={`/${locale}/admin/timetable/generate`}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          ✨ {t('actions.generateTimetable')}
        </Link>
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: 'emerald' | 'amber' | 'red';
}) {
  const colors: Record<string, string> = {
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
    red: 'text-red-700',
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div
        className={`mt-2 text-3xl font-semibold tabular-nums ${color ? colors[color] : 'text-slate-900'}`}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
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
