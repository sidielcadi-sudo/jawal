import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { listContractAlerts } from '@/lib/contract-alerts';

const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

export default async function StaffAttendanceSynthesePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const session = (await auth())!;
  const t = await getTranslations('admin.staffAttendance');
  const tSyn = await getTranslations('admin.staffAttendance.synthese');

  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthStr = sp.month ?? defaultMonth;
  const partsM = monthStr.split('-').map(Number);
  const yearNum = partsM[0] ?? now.getFullYear();
  const monthNum = partsM[1] ?? now.getMonth() + 1;
  const monthStart = new Date(Date.UTC(yearNum, monthNum - 1, 1));
  const monthEnd = new Date(Date.UTC(yearNum, monthNum, 1));

  const { totals, perPerson } = await withTenant(session.user.tenantId, async (tx) => {
    const persons = await tx.person.findMany({
      where: { type: { in: ['TEACHER', 'STAFF'] }, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        type: true,
        role: { select: { labelFr: true, labelAr: true } },
        staffAttendance: {
          where: { date: { gte: monthStart, lt: monthEnd } },
          select: { status: true, lateMinutes: true, deductionAmount: true },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    const totals = {
      headcount: persons.length,
      records: 0,
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
      leave: 0,
      lateMinutes: 0,
      deduction: 0,
    };

    const perPerson = persons.map((p) => {
      const agg = { absent: 0, late: 0, lateMinutes: 0, deduction: 0, records: 0 };
      for (const r of p.staffAttendance) {
        totals.records += 1;
        agg.records += 1;
        if (r.status === 'PRESENT') totals.present += 1;
        if (r.status === 'ABSENT') { totals.absent += 1; agg.absent += 1; }
        if (r.status === 'LATE') { totals.late += 1; agg.late += 1; }
        if (r.status === 'EXCUSED') totals.excused += 1;
        if (r.status === 'LEAVE') totals.leave += 1;
        const lm = r.lateMinutes ?? 0;
        totals.lateMinutes += lm;
        agg.lateMinutes += lm;
        const d = Number(r.deductionAmount);
        totals.deduction += d;
        agg.deduction += d;
      }
      return {
        personId: p.id,
        name: `${p.lastName} ${p.firstName}`,
        roleLabel: locale === 'ar' ? p.role?.labelAr ?? null : p.role?.labelFr ?? null,
        ...agg,
      };
    });

    return { totals, perPerson };
  });

  const alerts = await listContractAlerts(session.user.tenantId);

  const attended = totals.present + totals.late; // présents (à l'heure + en retard)
  const absenteeismRate = totals.records > 0 ? Math.round((totals.absent / totals.records) * 100) : null;
  const punctualityRate = attended > 0 ? Math.round((totals.present / attended) * 100) : null;

  const topLate = perPerson
    .filter((p) => p.lateMinutes > 0)
    .sort((a, b) => b.lateMinutes - a.lateMinutes || b.late - a.late)
    .slice(0, 5);
  const topAbsent = perPerson
    .filter((p) => p.absent > 0)
    .sort((a, b) => b.absent - a.absent)
    .slice(0, 5);

  const prevDate = new Date(Date.UTC(yearNum, monthNum - 2, 1));
  const nextDate = new Date(Date.UTC(yearNum, monthNum, 1));
  const fmtMonth = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

  return (
    <div className="px-3 py-3">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-3xl bg-gradient-to-r from-[#e8edff] to-[#eef0ff] px-4 py-2.5">
        <div>
          <h1 className="text-base font-bold text-slate-900">{tSyn('title')}</h1>
          <p className="mt-0.5 text-sm text-slate-600">
            {tSyn('subtitle', { headcount: totals.headcount })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/${locale}/admin/staff-attendance/synthese?month=${fmtMonth(prevDate)}`}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50"
          >
            ←
          </Link>
          <span className="text-sm font-medium text-slate-900">
            {MONTHS_FR[monthNum - 1]} {yearNum}
          </span>
          <Link
            href={`/${locale}/admin/staff-attendance/synthese?month=${fmtMonth(nextDate)}`}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50"
          >
            →
          </Link>
          <Link
            href={`/${locale}/admin/staff-attendance`}
            className="ms-2 text-xs text-brand-700 hover:underline"
          >
            {tSyn('backToDaily')}
          </Link>
        </div>
      </header>

      {/* KPIs mois */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label={tSyn('absenteeism')}
          value={absenteeismRate !== null ? `${absenteeismRate}%` : '—'}
          hint={tSyn('absenteeismHint', { absent: totals.absent, records: totals.records })}
          color={absenteeismRate === null ? 'slate' : absenteeismRate <= 5 ? 'emerald' : absenteeismRate <= 10 ? 'amber' : 'red'}
        />
        <Kpi
          label={tSyn('punctuality')}
          value={punctualityRate !== null ? `${punctualityRate}%` : '—'}
          hint={tSyn('punctualityHint', { late: totals.late })}
          color={punctualityRate === null ? 'slate' : punctualityRate >= 95 ? 'emerald' : punctualityRate >= 85 ? 'amber' : 'red'}
        />
        <Kpi
          label={tSyn('deductionMass')}
          value={`${totals.deduction.toFixed(2)} MAD`}
          hint={tSyn('deductionMassHint')}
          color={totals.deduction > 0 ? 'red' : 'slate'}
        />
        <Kpi
          label={tSyn('leaveDays')}
          value={String(totals.leave)}
          hint={tSyn('leaveDaysHint')}
          color={totals.leave > 0 ? 'blue' : 'slate'}
        />
      </div>

      {/* Tops */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopTable
          title={tSyn('topLate')}
          rows={topLate.map((p) => ({
            personId: p.personId,
            name: p.name,
            roleLabel: p.roleLabel,
            metric: `${p.lateMinutes} min`,
            sub: tSyn('lateCount', { count: p.late }),
          }))}
          empty={tSyn('topEmpty')}
          metricLabel={tSyn('lateMinutesCol')}
          locale={locale}
          tone="amber"
        />
        <TopTable
          title={tSyn('topAbsent')}
          rows={topAbsent.map((p) => ({
            personId: p.personId,
            name: p.name,
            roleLabel: p.roleLabel,
            metric: tSyn('absentDays', { count: p.absent }),
            sub: p.deduction > 0 ? `− ${p.deduction.toFixed(2)} MAD` : '',
          }))}
          empty={tSyn('topEmpty')}
          metricLabel={tSyn('absentCol')}
          locale={locale}
          tone="red"
        />
      </div>

      {/* Contrats à échéance */}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">{tSyn('contractAlerts')}</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            {alerts.length}
          </span>
        </div>
        {alerts.length === 0 ? (
          <p className="text-sm text-slate-500">{tSyn('contractAlertsEmpty')}</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {alerts.slice(0, 8).map((a) => (
              <li key={a.personId} className="flex items-center justify-between py-2">
                <Link
                  href={`/${locale}/admin/persons/${a.personId}`}
                  className="font-medium text-slate-800 hover:text-brand-700 hover:underline"
                >
                  {a.lastName} {a.firstName}
                </Link>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">
                    {a.endDate.toISOString().slice(0, 10)}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                      a.bucket === 'EXPIRED'
                        ? 'bg-red-100 text-red-700'
                        : a.bucket === 'EXPIRES_7'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    {a.bucket === 'EXPIRED'
                      ? tSyn('expired')
                      : tSyn('daysToEnd', { count: a.daysToEnd })}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-4 text-xs text-slate-500">{t('formulaHint')}</p>
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

function TopTable({
  title,
  rows,
  empty,
  metricLabel,
  locale,
  tone,
}: {
  title: string;
  rows: { personId: string; name: string; roleLabel: string | null; metric: string; sub: string }[];
  empty: string;
  metricLabel: string;
  locale: string;
  tone: 'amber' | 'red';
}) {
  const toneClass = tone === 'amber' ? 'text-amber-700' : 'text-red-700';
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        <span className="text-xs uppercase tracking-wide text-slate-400">{metricLabel}</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((r) => (
            <li key={r.personId} className="flex items-center justify-between px-4 py-2.5">
              <span>
                <Link
                  href={`/${locale}/admin/staff-attendance/${r.personId}/monthly`}
                  className="text-sm font-medium text-slate-800 hover:text-brand-700 hover:underline"
                >
                  {r.name}
                </Link>
                {r.roleLabel && <span className="ms-2 text-xs text-slate-400">{r.roleLabel}</span>}
              </span>
              <span className="text-end">
                <span className={`block text-sm font-semibold tabular-nums ${toneClass}`}>
                  {r.metric}
                </span>
                {r.sub && <span className="block text-[11px] text-slate-400">{r.sub}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
