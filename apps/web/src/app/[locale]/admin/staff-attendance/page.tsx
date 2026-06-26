import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { StaffAttendanceSheet, type StaffRow } from './sheet';

export default async function StaffAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const session = (await auth())!;
  const t = await getTranslations('admin.staffAttendance');

  const dateStr = sp.date ?? new Date().toISOString().slice(0, 10);
  const date = new Date(dateStr);
  date.setUTCHours(0, 0, 0, 0);

  const { rows, totals } = await withTenant(
    session.user.tenantId,
    async (tx) => {
      const persons = await tx.person.findMany({
        where: { type: { in: ['TEACHER', 'STAFF'] }, deletedAt: null },
        include: {
          role: { select: { labelFr: true, labelAr: true } },
          staffAttendance: { where: { date } },
        },
        orderBy: [{ type: 'asc' }, { lastName: 'asc' }, { firstName: 'asc' }],
      });

      const rows: StaffRow[] = persons.map((p) => {
        const existing = p.staffAttendance[0];
        return {
          personId: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
          type: p.type as 'TEACHER' | 'STAFF',
          roleLabelFr: p.role?.labelFr ?? null,
          roleLabelAr: p.role?.labelAr ?? null,
          grossSalary: p.grossSalary !== null ? Number(p.grossSalary) : null,
          status: (existing?.status ?? 'PRESENT') as StaffRow['status'],
          lateMinutes: existing?.lateMinutes ?? null,
          note: existing?.note ?? null,
          deductionAmount:
            existing?.deductionAmount !== undefined
              ? Number(existing.deductionAmount)
              : 0,
          deductionLocked: existing?.deductionLocked ?? false,
          hasExisting: !!existing,
        };
      });

      const totals = rows.reduce(
        (acc, r) => {
          acc.headcount += 1;
          if (!r.hasExisting) {
            acc.notRecorded += 1;
            return acc;
          }
          acc.recorded += 1;
          if (r.status === 'PRESENT') acc.present += 1;
          if (r.status === 'ABSENT') acc.absent += 1;
          if (r.status === 'LATE') acc.late += 1;
          if (r.status === 'EXCUSED') acc.excused += 1;
          if (r.status === 'LEAVE') acc.leave += 1;
          // Un retard compte comme présent (arrivée tardive) pour le taux de présence.
          if (r.status === 'PRESENT' || r.status === 'LATE') acc.attended += 1;
          acc.lateMinutes += r.lateMinutes ?? 0;
          acc.deduction += r.deductionAmount;
          return acc;
        },
        {
          present: 0,
          absent: 0,
          late: 0,
          excused: 0,
          leave: 0,
          deduction: 0,
          headcount: 0,
          recorded: 0,
          notRecorded: 0,
          attended: 0,
          lateMinutes: 0,
        },
      );

      return { rows, totals };
    },
  );

  const presenceRate =
    totals.recorded > 0 ? Math.round((totals.attended / totals.recorded) * 100) : null;

  const dayLocale = new Date(dateStr).toLocaleDateString(locale, {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="px-3 py-3">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-3xl bg-gradient-to-r from-[#e8edff] to-[#eef0ff] px-4 py-2.5">
        <div>
          <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-slate-600 first-letter:uppercase">{dayLocale}</p>
        </div>
        <div className="flex items-center gap-3">
          <form className="flex items-center gap-2">
            <label className="text-sm text-slate-600">{t('date')}</label>
            <input
              type="date"
              name="date"
              defaultValue={dateStr}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
            <button
              type="submit"
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              {t('apply')}
            </button>
          </form>
          <Link
            href={`/${locale}/admin/staff-attendance/synthese`}
            className="rounded-lg border border-brand-200 bg-white px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            {t('syntheseLink')}
          </Link>
        </div>
      </header>

      {/* KPIs synthèse jour */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label={t('kpi.presenceRate')}
          value={presenceRate !== null ? `${presenceRate}%` : '—'}
          hint={t('kpi.presenceRateHint', { attended: totals.attended, recorded: totals.recorded })}
          color={
            presenceRate === null
              ? 'slate'
              : presenceRate >= 90
                ? 'emerald'
                : presenceRate >= 75
                  ? 'amber'
                  : 'red'
          }
        />
        <Kpi
          label={t('kpi.notRecorded')}
          value={String(totals.notRecorded)}
          hint={t('kpi.notRecordedHint', { headcount: totals.headcount })}
          color={totals.notRecorded > 0 ? 'amber' : 'emerald'}
        />
        <Kpi
          label={t('kpi.lateMinutes')}
          value={`${totals.lateMinutes} min`}
          hint={t('kpi.lateMinutesHint', { count: totals.late })}
          color={totals.lateMinutes > 0 ? 'amber' : 'slate'}
        />
        <Kpi
          label={t('kpi.deduction')}
          value={`${totals.deduction.toFixed(2)} MAD`}
          hint={t('formulaHint')}
          color={totals.deduction > 0 ? 'red' : 'slate'}
        />
      </div>

      {/* KPIs détail par statut */}
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Counter label={t('counter.present')} value={totals.present} color="emerald" />
        <Counter label={t('counter.absent')} value={totals.absent} color="red" />
        <Counter label={t('counter.late')} value={totals.late} color="amber" />
        <Counter label={t('counter.excused')} value={totals.excused} color="blue" />
        <Counter label={t('counter.leave')} value={totals.leave} color="slate" />
      </div>

      <section className="mt-6">
        <StaffAttendanceSheet
          locale={locale}
          date={dateStr}
          initial={rows}
          backUrl={`/${locale}/admin`}
        />
      </section>

      <p className="mt-4 text-xs text-slate-500">
        {t('viewMonthlyHint')}{' '}
        <Link
          href={`/${locale}/admin/persons?type=TEACHER`}
          className="text-brand-700 hover:underline"
        >
          {t('viewMonthlyLink')}
        </Link>
      </p>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  color,
}: {
  label: string;
  value: string;
  hint?: string;
  color: 'emerald' | 'red' | 'amber' | 'blue' | 'slate';
}) {
  const colors: Record<string, string> = {
    emerald: 'text-emerald-700',
    red: 'text-red-700',
    amber: 'text-amber-700',
    blue: 'text-blue-700',
    slate: 'text-slate-600',
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${colors[color]}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-slate-400">{hint}</div>}
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
  color: 'emerald' | 'red' | 'amber' | 'blue' | 'slate';
}) {
  const colors: Record<string, string> = {
    emerald: 'text-emerald-700',
    red: 'text-red-700',
    amber: 'text-amber-700',
    blue: 'text-blue-700',
    slate: 'text-slate-600',
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
      <div className={`text-2xl font-semibold tabular-nums ${colors[color]}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
