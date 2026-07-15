import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';

const MONTHS_FR = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

export default async function MonthlyStaffAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; personId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { locale, personId } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const session = (await auth())!;
  const t = await getTranslations('admin.staffAttendance');
  const tStatus = await getTranslations('admin.staffAttendance.status');

  // monthStr format YYYY-MM (par défaut mois courant)
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthStr = sp.month ?? defaultMonth;
  const parts = monthStr.split('-').map(Number);
  const yearNum = parts[0] ?? now.getFullYear();
  const monthNum = parts[1] ?? now.getMonth() + 1;

  const monthStart = new Date(Date.UTC(yearNum, monthNum - 1, 1));
  const monthEnd = new Date(Date.UTC(yearNum, monthNum, 1));

  const { person, records, totals } = await withTenant(
    session.user.tenantId,
    async (tx) => {
      const person = await tx.person.findUnique({
        where: { id: personId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          type: true,
          grossSalary: true,
          netSalary: true,
          role: { select: { labelFr: true, labelAr: true } },
        },
      });
      if (!person) return { person: null, records: [], totals: null };

      const records = await tx.staffAttendance.findMany({
        where: { personId, date: { gte: monthStart, lt: monthEnd } },
        orderBy: { date: 'asc' },
      });

      const totals = records.reduce(
        (acc, r) => {
          if (r.status === 'PRESENT') acc.present += 1;
          if (r.status === 'ABSENT') acc.absent += 1;
          if (r.status === 'LATE') acc.late += 1;
          if (r.status === 'EXCUSED') acc.excused += 1;
          if (r.status === 'LEAVE') acc.leave += 1;
          acc.deduction += Number(r.deductionAmount);
          return acc;
        },
        { present: 0, absent: 0, late: 0, excused: 0, leave: 0, deduction: 0 },
      );

      return { person, records, totals };
    },
  );

  if (!person) notFound();

  const gross = person.grossSalary !== null ? Number(person.grossSalary) : null;
  const net = person.netSalary !== null ? Number(person.netSalary) : null;
  const netAfterDeduction = net !== null && totals ? net - totals.deduction : null;

  // Génère YYYY-MM pour navigation
  const prevDate = new Date(Date.UTC(yearNum, monthNum - 2, 1));
  const nextDate = new Date(Date.UTC(yearNum, monthNum, 1));
  const fmtMonth = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  const prevMonth = fmtMonth(prevDate);
  const nextMonth = fmtMonth(nextDate);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <nav className="mb-3 text-xs text-slate-500">
        <Link href={`/${locale}/admin/staff-attendance`} className="hover:text-brand-700">
          {t('title')}
        </Link>
        <span className="mx-1.5">›</span>
        <Link href={`/${locale}/admin/persons/${person.id}`} className="hover:text-brand-700">
          {person.lastName} {person.firstName}
        </Link>
        <span className="mx-1.5">›</span>
        <span>{t('monthly.title')}</span>
      </nav>

      <header className="-mx-6 overflow-hidden rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-3 mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {person.lastName} {person.firstName}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {locale === 'ar'
              ? person.role?.labelAr ?? '—'
              : person.role?.labelFr ?? '—'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/${locale}/admin/staff-attendance/${person.id}/monthly?month=${prevMonth}`}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50"
          >
            ←
          </Link>
          <span className="text-sm font-medium text-slate-900">
            {MONTHS_FR[monthNum - 1]} {yearNum}
          </span>
          <Link
            href={`/${locale}/admin/staff-attendance/${person.id}/monthly?month=${nextMonth}`}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50"
          >
            →
          </Link>
        </div>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
        <Kpi label={t('counter.present')} value={totals?.present ?? 0} color="emerald" />
        <Kpi label={t('counter.absent')} value={totals?.absent ?? 0} color="red" />
        <Kpi label={t('counter.late')} value={totals?.late ?? 0} color="amber" />
        <Kpi label={t('counter.excused')} value={totals?.excused ?? 0} color="blue" />
        <Kpi label={t('counter.leave')} value={totals?.leave ?? 0} color="slate" />
        <Kpi
          label={t('counter.totalDays')}
          value={records.length}
          color="brand"
        />
      </div>

      {/* Récap salaire */}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-base font-semibold text-slate-900">
          {t('monthly.payroll')}
        </h2>
        <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <Row
            label={t('monthly.gross')}
            value={gross !== null ? `${gross.toFixed(2)} MAD` : '—'}
          />
          <Row
            label={t('monthly.net')}
            value={net !== null ? `${net.toFixed(2)} MAD` : '—'}
          />
          <Row
            label={t('monthly.totalDeduction')}
            value={
              totals
                ? `− ${totals.deduction.toFixed(2)} MAD`
                : '0,00 MAD'
            }
            valueClass={totals && totals.deduction > 0 ? 'text-red-700' : ''}
          />
          <Row
            label={t('monthly.netAfter')}
            value={
              netAfterDeduction !== null
                ? `${netAfterDeduction.toFixed(2)} MAD`
                : '—'
            }
            valueClass="text-slate-900 font-semibold"
          />
        </div>
      </section>

      {/* Détail jour par jour */}
      <section className="mt-6">
        <h2 className="mb-3 text-base font-semibold text-slate-900">
          {t('monthly.details')}
        </h2>
        <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
              <tr>
                <th className="px-4 py-3 text-start">{t('monthly.day')}</th>
                <th className="px-4 py-3 text-start">{t('monthly.statusCol')}</th>
                <th className="px-4 py-3 text-end">{t('monthly.lateMinutes')}</th>
                <th className="px-4 py-3 text-end">{t('monthly.deduction')}</th>
                <th className="px-4 py-3 text-start">{t('monthly.note')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/${locale}/admin/staff-attendance?date=${r.date.toISOString().slice(0, 10)}`}
                      className="text-slate-700 hover:text-brand-700 hover:underline"
                    >
                      {r.date.toLocaleDateString(locale, {
                        weekday: 'short',
                        day: '2-digit',
                        month: '2-digit',
                      })}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={r.status} t={tStatus} />
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">
                    {r.lateMinutes !== null ? `${r.lateMinutes} min` : '—'}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">
                    {Number(r.deductionAmount) > 0 ? (
                      <span className="text-red-700">
                        − {Number(r.deductionAmount).toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{r.note ?? '—'}</td>
                </tr>
              ))}
              {records.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                    {t('monthly.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: 'emerald' | 'red' | 'amber' | 'blue' | 'slate' | 'brand';
}) {
  const colors: Record<string, string> = {
    emerald: 'text-emerald-700',
    red: 'text-red-700',
    amber: 'text-amber-700',
    blue: 'text-blue-700',
    slate: 'text-slate-600',
    brand: 'text-brand-700',
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
      <div className={`text-2xl font-semibold tabular-nums ${colors[color]}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function Row({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-1.5 last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className={`tabular-nums ${valueClass ?? 'text-slate-900'}`}>{value}</span>
    </div>
  );
}

function StatusPill({
  status,
  t,
}: {
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' | 'LEAVE';
  t: (k: string) => string;
}) {
  const map = {
    PRESENT: 'bg-emerald-100 text-emerald-700',
    ABSENT: 'bg-red-100 text-red-700',
    LATE: 'bg-amber-100 text-amber-700',
    EXCUSED: 'bg-blue-100 text-blue-700',
    LEAVE: 'bg-slate-100 text-slate-700',
  } as const;
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium uppercase ${map[status]}`}>
      {t(status)}
    </span>
  );
}
