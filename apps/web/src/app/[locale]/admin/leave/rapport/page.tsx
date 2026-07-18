import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { requireRoleCode } from '@/lib/auth/rbac';
import { withTenant } from '@/lib/db';

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function RemplacementsReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  await requireRoleCode(['tenant_admin', 'direction', 'cpe', 'scolarite']);
  const session = (await auth())!;
  const t = await getTranslations('admin.leave.report');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const year = await tx.academicYear.findFirst({
      where: { active: true },
      select: { startDate: true, endDate: true },
    });
    const fromDate = sp.from
      ? new Date(`${sp.from}T00:00:00.000Z`)
      : (year?.startDate ?? new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1)));
    const toDate = sp.to ? new Date(`${sp.to}T23:59:59.999Z`) : (year?.endDate ?? new Date());

    const overrides = await tx.timetableOverride.findMany({
      where: { date: { gte: fromDate, lte: toDate }, kind: { in: ['SUBSTITUTION', 'CANCELLED'] } },
      include: {
        entry: {
          select: {
            slot: { select: { startTime: true, endTime: true } },
            class: { select: { name: true } },
            subject: { select: { label: true } },
            teacher: { select: { firstName: true, lastName: true } },
          },
        },
        substituteTeacher: { select: { firstName: true, lastName: true } },
      },
      orderBy: { date: 'asc' },
    });

    // Absences enseignants approuvées chevauchant la période.
    const absences = await tx.leaveRequest.count({
      where: {
        status: 'APPROVED',
        person: { type: 'TEACHER' },
        startDate: { lte: toDate },
        endDate: { gte: fromDate },
      },
    });

    return { fromDate, toDate, overrides, absences };
  });

  const rows = data.overrides.map((o) => ({
    id: o.id,
    date: ymd(o.date),
    slot: `${o.entry.slot.startTime}–${o.entry.slot.endTime}`,
    className: o.entry.class.name,
    subject: o.entry.subject?.label ?? '—',
    absent: o.entry.teacher ? `${o.entry.teacher.lastName} ${o.entry.teacher.firstName}` : '—',
    kind: o.kind === 'CANCELLED' ? 'CANCELLED' : ('SUBSTITUTION' as const),
    substitute: o.substituteTeacher
      ? `${o.substituteTeacher.lastName} ${o.substituteTeacher.firstName}`
      : null,
  }));

  const substitutions = rows.filter((r) => r.kind === 'SUBSTITUTION');
  const cancellations = rows.filter((r) => r.kind === 'CANCELLED');

  // Séances couvertes par remplaçant (proxy des heures de remplacement).
  const bySubstitute = new Map<string, number>();
  for (const r of substitutions) {
    if (r.substitute) bySubstitute.set(r.substitute, (bySubstitute.get(r.substitute) ?? 0) + 1);
  }
  const substituteRanking = [...bySubstitute.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="px-3 py-3">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <div>
          <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-slate-600">
            {new Date(data.fromDate).toLocaleDateString(locale)} →{' '}
            {new Date(data.toDate).toLocaleDateString(locale)}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <form method="get" className="flex items-end gap-2">
            <label className="block">
              <span className="block text-xs text-slate-500">{t('from')}</span>
              <input type="date" name="from" defaultValue={ymd(data.fromDate)} className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm shadow-sm" />
            </label>
            <label className="block">
              <span className="block text-xs text-slate-500">{t('to')}</span>
              <input type="date" name="to" defaultValue={ymd(data.toDate)} className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm shadow-sm" />
            </label>
            <button type="submit" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
              {t('apply')}
            </button>
          </form>
          <Link href={`/${locale}/admin/leave`} className="text-xs text-brand-700 hover:underline">
            ← {t('back')}
          </Link>
        </div>
      </header>

      {/* Synthèse */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label={t('teacherAbsences')} value={data.absences} tone="slate" />
        <Tile label={t('substitutions')} value={substitutions.length} tone="emerald" />
        <Tile label={t('cancellations')} value={cancellations.length} tone="red" />
        <Tile label={t('coveredSessions')} value={substitutions.filter((r) => r.substitute).length} tone="brand" />
      </div>

      {/* Classement remplaçants */}
      {substituteRanking.length > 0 && (
        <section className="mb-5 rounded-2xl border border-brand-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">{t('bySubstitute')}</h2>
          <ul className="space-y-1.5">
            {substituteRanking.map(([name, count]) => (
              <li key={name} className="flex items-center justify-between text-sm">
                <span className="text-slate-800">{name}</span>
                <span className="tabular-nums text-slate-500">{t('sessions', { count })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Détail */}
      <section className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
            <tr>
              <th className="px-3 py-2.5 text-start">{t('date')}</th>
              <th className="px-3 py-2.5 text-start">{t('slot')}</th>
              <th className="px-3 py-2.5 text-start">{t('class')}</th>
              <th className="px-3 py-2.5 text-start">{t('subject')}</th>
              <th className="px-3 py-2.5 text-start">{t('absent')}</th>
              <th className="px-3 py-2.5 text-start">{t('result')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 text-xs text-slate-600">
                  {new Date(`${r.date}T00:00:00Z`).toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: '2-digit' })}
                </td>
                <td className="px-3 py-2 text-xs text-slate-500">{r.slot}</td>
                <td className="px-3 py-2 font-medium text-slate-800">{r.className}</td>
                <td className="px-3 py-2 text-xs text-slate-600">{r.subject}</td>
                <td className="px-3 py-2 text-xs text-slate-600">{r.absent}</td>
                <td className="px-3 py-2">
                  {r.kind === 'CANCELLED' ? (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">{t('cancelled')}</span>
                  ) : (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                      {r.substitute ?? t('substituteTbd')}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-500">
                  {t('empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

const TONE: Record<string, string> = {
  slate: 'text-slate-700',
  emerald: 'text-emerald-600',
  red: 'text-red-600',
  brand: 'text-brand-700',
};

function Tile({ label, value, tone }: { label: string; value: number; tone: keyof typeof TONE }) {
  return (
    <div className="rounded-2xl border border-brand-200 bg-white p-4">
      <div className={`text-2xl font-bold tabular-nums ${TONE[tone]}`}>{value}</div>
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
    </div>
  );
}
