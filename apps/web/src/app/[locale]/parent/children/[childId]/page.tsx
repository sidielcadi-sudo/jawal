import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { parentCanAccessChild } from '@/lib/parent';

const STATUS_TONE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  PARTIAL: 'bg-blue-100 text-blue-700',
  PAID: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

export default async function ParentChildPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; childId: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { locale, childId } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const session = (await auth())!;
  const tenantId = session.user.tenantId;
  const t = await getTranslations('parent.child');

  const data = await withTenant(tenantId, async (tx) => {
    if (!(await parentCanAccessChild(tx, session.user.id, childId))) return null;

    const child = await tx.person.findUnique({
      where: { id: childId },
      select: { id: true, firstName: true, lastName: true, birthDate: true },
    });
    if (!child) return null;

    // Historique multi-années : on liste toutes les années et on sélectionne
    // celle demandée (?year=), sinon l'année active, sinon la plus récente.
    const years = await tx.academicYear.findMany({
      orderBy: { startDate: 'desc' },
      include: { periods: { orderBy: { startDate: 'asc' } } },
    });
    const selectedYear =
      years.find((y) => y.id === sp.year) ?? years.find((y) => y.active) ?? years[0] ?? null;

    const sc = await tx.studentClass.findFirst({
      where: {
        studentId: childId,
        unenrolledAt: null,
        ...(selectedYear ? { class: { academicYearId: selectedYear.id } } : {}),
      },
      include: { class: { select: { id: true, name: true, level: { select: { cycle: { select: { label: true } }, label: true } } } } },
    });

    // Présences sur l'année sélectionnée.
    const records = selectedYear
      ? await tx.attendanceRecord.findMany({
          where: {
            studentId: childId,
            session: { date: { gte: selectedYear.startDate, lte: selectedYear.endDate } },
          },
          include: {
            session: { include: { class: { select: { name: true } } } },
            justification: { select: { status: true } },
          },
          orderBy: { session: { date: 'desc' } },
        })
      : [];
    const att = records.reduce(
      (acc, r) => {
        acc.total += 1;
        if (r.status === 'PRESENT') acc.present += 1;
        if (r.status === 'ABSENT') acc.absent += 1;
        if (r.status === 'LATE') acc.late += 1;
        if (r.status === 'EXCUSED') acc.excused += 1;
        return acc;
      },
      { total: 0, present: 0, absent: 0, late: 0, excused: 0 },
    );
    const rate = att.total > 0 ? (att.present / att.total) * 100 : null;
    const recentAbsences = records
      .filter((r) => r.status !== 'PRESENT')
      .slice(0, 8)
      .map((r) => ({
        id: r.id,
        date: r.session.date,
        status: r.status as 'ABSENT' | 'LATE' | 'EXCUSED',
        className: r.session.class.name,
        justif: (r.justification?.status as 'PENDING' | 'APPROVED' | 'REJECTED' | undefined) ?? null,
      }));

    // Scolarité.
    const installments = await tx.installment.findMany({
      where: { studentId: childId, status: { not: 'CANCELLED' } },
      include: { payments: { select: { amount: true } } },
      orderBy: { dueDate: 'asc' },
    });
    const fees = installments.map((i) => {
      const paid = i.payments.reduce((s, p) => s + Number(p.amount), 0);
      return {
        id: i.id,
        label: i.label,
        amount: Number(i.amount),
        paid,
        remaining: Math.max(0, Number(i.amount) - paid),
        dueDate: i.dueDate,
        status: i.status as 'PENDING' | 'PARTIAL' | 'PAID',
      };
    });
    const totalDue = fees.reduce((s, f) => s + f.amount, 0);
    const totalPaid = fees.reduce((s, f) => s + f.paid, 0);

    return {
      child,
      classInfo: sc?.class ?? null,
      periods: selectedYear?.periods ?? [],
      years: years.map((y) => ({ id: y.id, label: y.label, active: y.active })),
      selectedYearId: selectedYear?.id ?? null,
      att,
      rate,
      recentAbsences,
      fees,
      totalDue,
      totalPaid,
      totalRemaining: Math.max(0, totalDue - totalPaid),
    };
  });

  if (!data) notFound();
  const { child, classInfo, periods, years, selectedYearId, att, rate, recentAbsences, fees, totalDue, totalPaid, totalRemaining } = data;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <nav className="mb-4 text-xs text-slate-500">
        <Link href={`/${locale}/parent`} className="hover:text-brand-700">
          {t('breadcrumbHome')}
        </Link>
        <span className="mx-1.5">›</span>
        <span>
          {child.firstName} {child.lastName}
        </span>
      </nav>

      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-xl bg-slate-200 text-xl font-semibold text-slate-600">
            {(child.firstName[0] ?? '') + (child.lastName[0] ?? '')}
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {child.firstName} {child.lastName}
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {classInfo ? `${classInfo.level.cycle.label} · ${classInfo.name}` : t('noClass')}
            </p>
          </div>
        </div>

        {years.length > 1 && (
          <form method="get" className="flex items-end gap-2">
            <label className="block">
              <span className="block text-xs text-slate-500">{t('year')}</span>
              <select
                name="year"
                defaultValue={selectedYearId ?? ''}
                className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm shadow-sm"
              >
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              {t('viewYear')}
            </button>
          </form>
        )}
      </header>

      {/* Bulletins */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-700">{t('bulletins.title')}</h2>
        {!classInfo || periods.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">{t('bulletins.empty')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {periods.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-slate-800">{p.label}</span>
                <a
                  href={`/api/parent/children/${child.id}/bulletin.pdf?period=${p.id}`}
                  className="rounded-lg border border-brand-600 bg-white px-3 py-1.5 text-xs font-medium text-brand-700 shadow-sm hover:bg-brand-50"
                >
                  ⬇ {t('bulletins.download')}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Présences */}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">{t('attendance.title')}</h2>
          {rate !== null && (
            <span
              className={`text-lg font-semibold tabular-nums ${rate < 90 ? 'text-red-700' : 'text-emerald-700'}`}
            >
              {rate.toFixed(1)}%
            </span>
          )}
        </div>
        {att.total === 0 ? (
          <p className="mt-2 text-xs text-slate-500">{t('attendance.empty')}</p>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
              <Mini value={att.present} label={t('attendance.present')} tone="emerald" />
              <Mini value={att.absent} label={t('attendance.absent')} tone="red" />
              <Mini value={att.late} label={t('attendance.late')} tone="amber" />
              <Mini value={att.excused} label={t('attendance.excused')} tone="blue" />
            </div>
            {recentAbsences.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <span className="text-xs font-medium text-slate-700">{t('attendance.recent')}</span>
                <ul className="mt-2 space-y-1.5 text-xs">
                  {recentAbsences.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between rounded-lg border border-slate-100 px-2 py-1.5"
                    >
                      <span className="text-slate-700">
                        {new Date(a.date).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })}{' '}
                        · <span className="text-slate-500">{a.className}</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                            a.status === 'ABSENT'
                              ? 'bg-red-100 text-red-700'
                              : a.status === 'LATE'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {t(`attendance.${a.status}`)}
                        </span>
                        {a.justif && (
                          <span
                            className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600"
                            title={t(`attendance.justif.${a.justif}`)}
                          >
                            {a.justif === 'PENDING' ? '?' : a.justif === 'APPROVED' ? '✓' : '✕'}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      {/* Scolarité */}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">{t('finance.title')}</h2>
          <span className="text-xs text-slate-500">
            {t('finance.paidOf', {
              paid: totalPaid.toLocaleString(locale),
              due: totalDue.toLocaleString(locale),
            })}
          </span>
        </div>
        {fees.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">{t('finance.empty')}</p>
        ) : (
          <>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <th className="py-2 text-start font-medium">{t('finance.label')}</th>
                  <th className="py-2 text-end font-medium">{t('finance.dueDate')}</th>
                  <th className="py-2 text-end font-medium">{t('finance.amount')}</th>
                  <th className="py-2 text-end font-medium">{t('finance.remaining')}</th>
                  <th className="py-2 text-center font-medium">{t('finance.status')}</th>
                </tr>
              </thead>
              <tbody>
                {fees.map((f) => (
                  <tr key={f.id} className="border-b border-slate-100">
                    <td className="py-2 text-slate-800">{f.label}</td>
                    <td className="py-2 text-end tabular-nums text-slate-500">
                      {new Date(f.dueDate).toLocaleDateString(locale)}
                    </td>
                    <td className="py-2 text-end tabular-nums">{f.amount.toLocaleString(locale)}</td>
                    <td className="py-2 text-end tabular-nums font-medium">
                      {f.remaining > 0 ? f.remaining.toLocaleString(locale) : '—'}
                    </td>
                    <td className="py-2 text-center">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${STATUS_TONE[f.status]}`}
                      >
                        {t(`finance.statuses.${f.status}`)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
              <span className="text-sm font-medium text-slate-700">{t('finance.totalRemaining')}</span>
              <div className="flex items-center gap-3">
                <span
                  className={`text-lg font-semibold tabular-nums ${totalRemaining > 0 ? 'text-amber-700' : 'text-emerald-700'}`}
                >
                  {totalRemaining.toLocaleString(locale)} MAD
                </span>
                {totalRemaining > 0 && (
                  <button
                    type="button"
                    disabled
                    title={t('finance.payOnlineSoon')}
                    className="cursor-not-allowed rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500"
                  >
                    {t('finance.payOnline')} · {t('finance.soon')}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Mini({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: 'emerald' | 'red' | 'amber' | 'blue';
}) {
  const colors: Record<string, string> = {
    emerald: 'text-emerald-700',
    red: 'text-red-700',
    amber: 'text-amber-700',
    blue: 'text-blue-700',
  };
  return (
    <div className="rounded-lg border border-slate-100 px-2 py-2">
      <div className={`text-lg font-semibold tabular-nums ${colors[tone]}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}
