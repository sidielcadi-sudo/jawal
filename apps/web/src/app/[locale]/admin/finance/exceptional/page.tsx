import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { CreateFeeForm, FeeRowActions, FeeTypesManager } from './client';

const STATUS_TONE: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  PUBLISHED: 'bg-emerald-100 text-emerald-700',
  CLOSED: 'bg-slate-200 text-slate-500',
};

export default async function ExceptionalFeesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.exceptionalFees');
  const session = (await auth())!;

  const { fees, years, types, currency, classes } = await withTenant(session.user.tenantId, async (tx) => {
    const [feeRows, years, types, tenant, classRows] = await Promise.all([
      tx.exceptionalFee.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          type: { select: { labelFr: true } },
          assignments: { select: { consent: true } },
        },
      }),
      tx.academicYear.findMany({ orderBy: { startDate: 'desc' }, select: { id: true, label: true } }),
      tx.exceptionalFeeType.findMany({
        orderBy: [{ order: 'asc' }, { labelFr: 'asc' }],
        select: { id: true, labelFr: true, labelAr: true, order: true, active: true },
      }),
      tx.tenant.findFirst({ select: { currency: true } }),
      tx.class.findMany({
        where: { academicYear: { active: true } },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          students: {
            where: { unenrolledAt: null },
            select: { student: { select: { id: true, firstName: true, lastName: true } } },
          },
        },
      }),
    ]);
    return {
      classes: classRows.map((c) => ({
        id: c.id,
        name: c.name,
        students: c.students.map((sc) => ({
          id: sc.student.id,
          name: `${sc.student.lastName} ${sc.student.firstName}`,
        })),
      })),
      fees: feeRows.map((f) => {
        const a = f.assignments;
        return {
          id: f.id,
          label: f.label,
          typeLabel: f.type?.labelFr ?? null,
          amount: Number(f.amount),
          mandatory: f.mandatory,
          status: f.status,
          activityDate: f.activityDate,
          assigned: a.length,
          accepted: a.filter((x) => x.consent === 'ACCEPTED').length,
          refused: a.filter((x) => x.consent === 'REFUSED').length,
          pending: a.filter((x) => x.consent === 'PENDING').length,
        };
      }),
      years,
      types,
      currency: tenant?.currency ?? 'MAD',
    };
  });

  const base = `/${locale}/admin/finance/exceptional`;

  return (
    <div className="px-3 py-3">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 overflow-hidden rounded-3xl bg-gradient-to-r from-[#e8edff] to-[#eef0ff] px-4 py-2.5">
        <div>
          <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-slate-600">{t('subtitle')}</p>
        </div>
        <Link href={`/${locale}/admin/finance`} className="text-xs text-brand-700 hover:underline">
          ← {t('backToFinance')}
        </Link>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-start">{t('table.label')}</th>
                  <th className="px-4 py-3 text-end">{t('table.amount')}</th>
                  <th className="px-4 py-3 text-center">{t('table.status')}</th>
                  <th className="whitespace-nowrap px-4 py-3 text-center">{t('table.consent')}</th>
                  <th className="px-4 py-3 text-end">{t('table.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {fees.map((f) => (
                  <tr key={f.id}>
                    <td className="px-4 py-3">
                      <Link href={`${base}/${f.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                        {f.label}
                      </Link>
                      <div className="text-[11px] text-slate-400">
                        {f.typeLabel ? `${f.typeLabel} · ` : ''}
                        {f.mandatory ? t('mandatoryBadge') : t('optionalBadge')}
                        {f.activityDate ? ` · ${new Date(f.activityDate).toLocaleDateString(locale)}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-end tabular-nums">
                      {f.amount.toLocaleString(locale)} {currency}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${STATUS_TONE[f.status]}`}>
                        {t(`statuses.${f.status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {f.assigned === 0 ? (
                        <div className="text-center text-xs text-slate-400">—</div>
                      ) : (
                        <div className="mx-auto flex w-fit flex-col gap-1 text-[11px] font-medium">
                          <span className="flex items-center justify-between gap-3 whitespace-nowrap rounded bg-emerald-100 px-2 py-0.5 text-emerald-800">
                            <span>{t('consents.ACCEPTED')}</span>
                            <span className="font-bold tabular-nums">{f.accepted}</span>
                          </span>
                          <span className="flex items-center justify-between gap-3 whitespace-nowrap rounded bg-amber-100 px-2 py-0.5 text-amber-800">
                            <span>{t('consents.PENDING')}</span>
                            <span className="font-bold tabular-nums">{f.pending}</span>
                          </span>
                          <span className="flex items-center justify-between gap-3 whitespace-nowrap rounded bg-red-100 px-2 py-0.5 text-red-800">
                            <span>{t('consents.REFUSED')}</span>
                            <span className="font-bold tabular-nums">{f.refused}</span>
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-end">
                      <FeeRowActions id={f.id} status={f.status} />
                    </td>
                  </tr>
                ))}
                {fees.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-slate-500">{t('empty')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="space-y-6">
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">{t('create')}</h2>
            <p className="mt-1 text-xs text-slate-500">{t('createHint')}</p>
            <div className="mt-4">
              <CreateFeeForm years={years} types={types} currency={currency} classes={classes} />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">{t('types.title')}</h2>
            <p className="mt-1 text-xs text-slate-500">{t('types.subtitle')}</p>
            <div className="mt-4">
              <FeeTypesManager types={types} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
