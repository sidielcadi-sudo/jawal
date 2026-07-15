import { redirect } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { computeHeadcount, computeAcademicOverview, computeAttendanceRate } from '@/lib/bi';
import { pickPeriodId } from '@/lib/periods';

type Row = {
  name: string;
  students: number;
  teachers: number;
  classes: number;
  avg: number | null;
  attendance: number | null;
  due: number;
  paid: number;
  remaining: number;
  collectionPct: number | null;
  currency: string;
};

export default async function GroupDashboard({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = (await auth())!;
  // Réservé aux comptes multi-établissements.
  if (session.user.sites.length <= 1) redirect(`/${locale}/admin`);
  const t = await getTranslations('admin.group');

  const rows: Row[] = await Promise.all(
    session.user.sites.map((site) =>
      withTenant(site.tenantId, async (tx): Promise<Row> => {
        const year = await tx.academicYear.findFirst({
          where: { active: true },
          include: { periods: { orderBy: { startDate: 'asc' } } },
        });
        const periods = year?.periods ?? [];
        const periodId = pickPeriodId(periods);

        const headcount = await computeHeadcount(tx);
        const academic = periodId ? await computeAcademicOverview(tx, periodId) : null;
        const attendance = periodId ? await computeAttendanceRate(tx, periodId) : null;

        const installments = await tx.installment.findMany({
          where: { status: { not: 'CANCELLED' } },
          select: { amount: true },
        });
        const payments = await tx.payment.findMany({ select: { amount: true } });
        const due = installments.reduce((s, i) => s + Number(i.amount), 0);
        const paid = payments.reduce((s, p) => s + Number(p.amount), 0);
        const tenant = await tx.tenant.findFirst({ select: { currency: true } });

        return {
          name: site.name,
          students: headcount.students,
          teachers: headcount.teachers,
          classes: headcount.classes,
          avg: academic?.averageGeneral ?? null,
          attendance: attendance?.rate ?? null,
          due,
          paid,
          remaining: Math.max(0, due - paid),
          collectionPct: due > 0 ? (paid / due) * 100 : null,
          currency: tenant?.currency ?? 'MAD',
        };
      }),
    ),
  );

  const totals = rows.reduce(
    (a, r) => ({
      students: a.students + r.students,
      teachers: a.teachers + r.teachers,
      classes: a.classes + r.classes,
      due: a.due + r.due,
      paid: a.paid + r.paid,
      remaining: a.remaining + r.remaining,
    }),
    { students: 0, teachers: 0, classes: 0, due: 0, paid: 0, remaining: 0 },
  );
  const currency = rows[0]?.currency ?? 'MAD';
  const fmt = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 0 });
  const totalCollection = totals.due > 0 ? (totals.paid / totals.due) * 100 : null;

  return (
    <div className="px-3 py-3">
      <header className="mb-4 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
        <p className="mt-0.5 text-sm text-slate-600">{t('subtitle', { count: rows.length })}</p>
      </header>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
            <tr>
              <th className="px-4 py-3 text-start">{t('site')}</th>
              <th className="px-4 py-3 text-end">{t('students')}</th>
              <th className="px-4 py-3 text-end">{t('teachers')}</th>
              <th className="px-4 py-3 text-end">{t('classes')}</th>
              <th className="px-4 py-3 text-end">{t('average')}</th>
              <th className="px-4 py-3 text-end">{t('attendance')}</th>
              <th className="px-4 py-3 text-end">{t('collection')}</th>
              <th className="px-4 py-3 text-end">{t('remaining')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.name}>
                <td className="px-4 py-3 font-medium text-slate-900">{r.name}</td>
                <td className="px-4 py-3 text-end tabular-nums">{r.students}</td>
                <td className="px-4 py-3 text-end tabular-nums">{r.teachers}</td>
                <td className="px-4 py-3 text-end tabular-nums">{r.classes}</td>
                <td className="px-4 py-3 text-end tabular-nums">{r.avg !== null ? r.avg.toFixed(2) : '—'}</td>
                <td className="px-4 py-3 text-end tabular-nums">
                  {r.attendance !== null ? `${r.attendance.toFixed(1)}%` : '—'}
                </td>
                <td className="px-4 py-3 text-end tabular-nums">
                  {r.collectionPct !== null ? `${r.collectionPct.toFixed(1)}%` : '—'}
                </td>
                <td className="px-4 py-3 text-end tabular-nums text-amber-700">
                  {fmt(r.remaining)} {r.currency}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900">
            <tr>
              <td className="px-4 py-3">{t('total')}</td>
              <td className="px-4 py-3 text-end tabular-nums">{totals.students}</td>
              <td className="px-4 py-3 text-end tabular-nums">{totals.teachers}</td>
              <td className="px-4 py-3 text-end tabular-nums">{totals.classes}</td>
              <td className="px-4 py-3 text-end text-slate-400">—</td>
              <td className="px-4 py-3 text-end text-slate-400">—</td>
              <td className="px-4 py-3 text-end tabular-nums">
                {totalCollection !== null ? `${totalCollection.toFixed(1)}%` : '—'}
              </td>
              <td className="px-4 py-3 text-end tabular-nums text-amber-700">
                {fmt(totals.remaining)} {currency}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="mt-3 text-xs text-slate-400">{t('note')}</p>
    </div>
  );
}
