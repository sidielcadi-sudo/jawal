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
          if (!r.hasExisting) return acc;
          if (r.status === 'PRESENT') acc.present += 1;
          if (r.status === 'ABSENT') acc.absent += 1;
          if (r.status === 'LATE') acc.late += 1;
          if (r.status === 'EXCUSED') acc.excused += 1;
          if (r.status === 'LEAVE') acc.leave += 1;
          acc.deduction += r.deductionAmount;
          return acc;
        },
        { present: 0, absent: 0, late: 0, excused: 0, leave: 0, deduction: 0 },
      );

      return { rows, totals };
    },
  );

  const dayLocale = new Date(dateStr).toLocaleDateString(locale, {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{t('title')}</h1>
          <p className="mt-1 text-sm text-slate-500 first-letter:uppercase">{dayLocale}</p>
        </div>
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
      </header>

      {/* KPIs jour */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Counter label={t('counter.present')} value={totals.present} color="emerald" />
        <Counter label={t('counter.absent')} value={totals.absent} color="red" />
        <Counter label={t('counter.late')} value={totals.late} color="amber" />
        <Counter label={t('counter.excused')} value={totals.excused} color="blue" />
        <Counter label={t('counter.leave')} value={totals.leave} color="slate" />
      </div>

      <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm">
        <span className="text-slate-500">{t('totalDeduction')} :</span>{' '}
        <span className="font-semibold tabular-nums text-red-700">
          {totals.deduction.toFixed(2)} MAD
        </span>
        <p className="mt-1 text-xs text-slate-500">{t('formulaHint')}</p>
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
