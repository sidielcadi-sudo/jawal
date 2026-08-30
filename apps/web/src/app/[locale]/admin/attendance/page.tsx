import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { localizedLabel } from '@/lib/localized-name';

type ClassRow = {
  classId: string;
  name: string;
  levelLabel: string;
  cycleLabel: string;
  enrolled: number;
  sessionId: string | null;
  finalized: boolean;
  present: number;
  absent: number;
  late: number;
  excused: number;
};

export default async function AdminAttendancePage({
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
  const t = await getTranslations('admin.attendanceIndex');

  const dateStr = sp.date ?? new Date().toISOString().slice(0, 10);
  const date = new Date(dateStr);
  date.setUTCHours(0, 0, 0, 0);

  const { rows, totalPending, year } = await withTenant(
    session.user.tenantId,
    async (tx) => {
      const activeYear = await tx.academicYear.findFirst({ where: { active: true } });
      if (!activeYear) {
        return { rows: [] as ClassRow[], totalPending: 0, year: null };
      }

      const classes = await tx.class.findMany({
        where: { academicYearId: activeYear.id, deletedAt: null },
        include: {
          level: { include: { cycle: true } },
          students: { where: { unenrolledAt: null } },
          attendanceSessions: {
            where: { date },
            include: {
              records: true,
            },
          },
        },
        orderBy: [{ level: { order: 'asc' } }, { name: 'asc' }],
      });

      const rows: ClassRow[] = classes.map((cls) => {
        const sess = cls.attendanceSessions[0] ?? null;
        const records = sess?.records ?? [];
        return {
          classId: cls.id,
          name: localizedLabel(locale, cls.name, cls.nameAr),
          levelLabel: localizedLabel(locale, cls.level.label, cls.level.labelAr),
          cycleLabel: localizedLabel(locale, cls.level.cycle.label, cls.level.cycle.labelAr),
          enrolled: cls.students.length,
          sessionId: sess?.id ?? null,
          finalized: !!sess?.finalizedAt,
          present: records.filter((r) => r.status === 'PRESENT').length,
          absent: records.filter((r) => r.status === 'ABSENT').length,
          late: records.filter((r) => r.status === 'LATE').length,
          excused: records.filter((r) => r.status === 'EXCUSED').length,
        };
      });

      const totalPending = await tx.absenceJustification.count({
        where: { status: 'PENDING' },
      });

      return { rows, totalPending, year: activeYear.label };
    },
  );

  const totalEnrolled = rows.reduce((s, r) => s + r.enrolled, 0);
  const totalPresent = rows.reduce((s, r) => s + r.present, 0);
  const totalAbsent = rows.reduce((s, r) => s + r.absent, 0);
  const totalLate = rows.reduce((s, r) => s + r.late, 0);
  const totalExcused = rows.reduce((s, r) => s + r.excused, 0);
  const totalRecords = totalPresent + totalAbsent + totalLate + totalExcused;
  const classesTaken = rows.filter((r) => r.sessionId).length;
  const classesFinalized = rows.filter((r) => r.finalized).length;
  const attendanceRate =
    totalRecords > 0 ? ((totalPresent / totalRecords) * 100).toFixed(1) : null;

  const dayLocale = new Date(dateStr).toLocaleDateString(locale, {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="px-3 py-3">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-4 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <div>
          <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-slate-600 first-letter:uppercase">
            {dayLocale} {year ? `· ${year}` : ''}
          </p>
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
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label={t('kpi.classesTaken')}
          value={`${classesTaken} / ${rows.length}`}
          sub={t('kpi.finalized', { count: classesFinalized })}
          color={classesTaken === rows.length && rows.length > 0 ? 'emerald' : undefined}
        />
        <Kpi
          label={t('kpi.attendanceRate')}
          value={attendanceRate !== null ? `${attendanceRate}%` : '—'}
          sub={t('kpi.records', { count: totalRecords })}
          color={getAttendanceColor(attendanceRate)}
        />
        <Kpi
          label={t('kpi.absentToday')}
          value={String(totalAbsent + totalLate)}
          sub={t('kpi.absentSub', { absent: totalAbsent, late: totalLate })}
          color={totalAbsent > 0 ? 'red' : undefined}
        />
        <Kpi
          label={t('kpi.pendingJustifications')}
          value={String(totalPending)}
          sub={
            totalPending > 0
              ? t('kpi.pendingSub')
              : t('kpi.allReviewed')
          }
          color={totalPending > 0 ? 'amber' : 'emerald'}
        />
      </div>

      {totalPending > 0 && (
        <div className="mt-4">
          <Link
            href={`/${locale}/admin/attendance/justifications`}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
          >
            {t('reviewQueue', { count: totalPending })} →
          </Link>
        </div>
      )}

      {/* Tableau classes */}
      <section className="mt-6">
        <h2 className="mb-3 text-base font-semibold text-slate-900">{t('classes.title')}</h2>
        <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
              <tr>
                <th className="px-4 py-3 text-start">{t('classes.name')}</th>
                <th className="px-4 py-3 text-start">{t('classes.level')}</th>
                <th className="px-4 py-3 text-end">{t('classes.enrolled')}</th>
                <th className="px-4 py-3 text-start">{t('classes.status')}</th>
                <th className="px-4 py-3 text-end">{t('classes.absent')}</th>
                <th className="px-4 py-3 text-end">{t('classes.late')}</th>
                <th className="px-4 py-3 text-end">{t('classes.action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.classId}>
                  <td className="px-4 py-3 font-medium text-slate-900">{r.name}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {r.cycleLabel} · {r.levelLabel}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums text-slate-700">
                    {r.enrolled}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge sessionId={r.sessionId} finalized={r.finalized} t={t} />
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">
                    {r.sessionId ? (
                      <span className={r.absent > 0 ? 'text-red-700' : 'text-slate-400'}>
                        {r.absent}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">
                    {r.sessionId ? (
                      <span className={r.late > 0 ? 'text-amber-700' : 'text-slate-400'}>
                        {r.late}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-end">
                    <Link
                      href={`/${locale}/admin/classes/${r.classId}/attendance?date=${dateStr}`}
                      className="text-xs font-medium text-brand-700 hover:underline"
                    >
                      {r.sessionId ? t('classes.open') : t('classes.start')} →
                    </Link>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                    {t('classes.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {t('totalEnrolled', { count: totalEnrolled })} · {t('totalExcused', { count: totalExcused })}
        </p>
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

function StatusBadge({
  sessionId,
  finalized,
  t,
}: {
  sessionId: string | null;
  finalized: boolean;
  t: (k: string) => string;
}) {
  if (!sessionId) {
    return (
      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
        {t('status.notTaken')}
      </span>
    );
  }
  if (finalized) {
    return (
      <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
        {t('status.finalized')}
      </span>
    );
  }
  return (
    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
      {t('status.draft')}
    </span>
  );
}

function getAttendanceColor(rate: string | null): 'emerald' | 'amber' | 'red' | undefined {
  if (rate === null) return undefined;
  const r = Number(rate);
  if (r >= 95) return 'emerald';
  if (r >= 90) return 'amber';
  return 'red';
}
