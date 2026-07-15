import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { computeLeaveBalance } from '@/lib/leave';
import { SeedTypesButton, CreateRequestForm, RequestRowActions } from './leave-client';

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

export default async function LeavePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('admin.leave');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const [types, staff, requests] = await Promise.all([
      tx.leaveType.findMany({ where: { active: true }, orderBy: { order: 'asc' } }),
      tx.person.findMany({
        where: { type: { in: ['STAFF', 'TEACHER'] }, deletedAt: null },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        select: { id: true, firstName: true, lastName: true, hireDate: true },
      }),
      tx.leaveRequest.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { person: { select: { firstName: true, lastName: true, type: true } }, leaveType: { select: { labelFr: true, labelAr: true } } },
      }),
    ]);
    const annual = types.find((t) => t.code === 'ANNUAL') ?? null;
    const takenByPerson = annual
      ? await tx.leaveRequest.groupBy({
          by: ['personId'],
          where: { status: 'APPROVED', leaveTypeId: annual.id },
          _sum: { days: true },
        })
      : [];
    return { types, staff, requests, annual, takenByPerson };
  });

  const { types, staff, requests, annual, takenByPerson } = data;
  const takenMap = new Map(takenByPerson.map((g) => [g.personId, g._sum.days ?? 0]));
  const typeLabel = (fr: string, ar: string) => (locale === 'ar' ? ar : fr);

  return (
    <div className="px-3 py-3">
      <header className="mb-4 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">🏖️ {t('title')}</h1>
        <p className="mt-0.5 text-sm text-slate-600">{t('subtitle')}</p>
      </header>

      {types.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center">
          <p className="mb-3 text-sm text-slate-600">{t('noTypes')}</p>
          <SeedTypesButton />
        </div>
      ) : (
        <>
          {/* Demande */}
          <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-900">{t('newRequest')}</h2>
            <CreateRequestForm
              staff={staff.map((s) => ({ id: s.id, label: `${s.lastName} ${s.firstName}` }))}
              types={types.map((t) => ({ id: t.id, label: typeLabel(t.labelFr, t.labelAr) }))}
            />
          </section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Demandes */}
            <section className="lg:col-span-2">
              <h2 className="mb-2 text-base font-semibold text-slate-900">{t('requests')}</h2>
              <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
                    <tr>
                      <th className="px-3 py-2.5 text-start">{t('employee')}</th>
                      <th className="px-3 py-2.5 text-start">{t('type')}</th>
                      <th className="px-3 py-2.5 text-start">{t('period')}</th>
                      <th className="px-3 py-2.5 text-end">{t('days')}</th>
                      <th className="px-3 py-2.5 text-center">{t('status')}</th>
                      <th className="px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {requests.map((r) => (
                      <tr key={r.id}>
                        <td className="px-3 py-2.5 font-medium text-slate-800">{r.person.lastName} {r.person.firstName}</td>
                        <td className="px-3 py-2.5 text-xs text-slate-600">{typeLabel(r.leaveType.labelFr, r.leaveType.labelAr)}</td>
                        <td className="px-3 py-2.5 text-xs text-slate-500">
                          {new Date(r.startDate).toLocaleDateString(locale)} → {new Date(r.endDate).toLocaleDateString(locale)}
                        </td>
                        <td className="px-3 py-2.5 text-end tabular-nums text-slate-600">{r.days}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_BADGE[r.status]}`}>{t(`statusLabel.${r.status}`)}</span>
                        </td>
                        <td className="px-3 py-2.5 text-end">
                          <span className="flex items-center justify-end gap-2">
                            {r.status === 'APPROVED' && r.person.type === 'TEACHER' && (
                              <a href={`/${locale}/admin/leave/${r.id}/remplacements`} className="text-xs font-medium text-brand-600 hover:text-brand-700 hover:underline">
                                {t('subs.link')}
                              </a>
                            )}
                            <RequestRowActions id={r.id} status={r.status} />
                          </span>
                        </td>
                      </tr>
                    ))}
                    {requests.length === 0 && (
                      <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">{t('empty')}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Soldes congé annuel */}
            <aside>
              <h2 className="mb-2 text-base font-semibold text-slate-900">{t('balances')}</h2>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="mb-2 text-[11px] text-slate-400">{t('balanceHint', { rate: annual?.accrualPerMonth ?? 1.5 })}</p>
                <ul className="divide-y divide-slate-100 text-sm">
                  {staff.map((s) => {
                    const bal = computeLeaveBalance({
                      hireDate: s.hireDate,
                      accrualPerMonth: annual?.accrualPerMonth ?? null,
                      takenDays: takenMap.get(s.id) ?? 0,
                    });
                    return (
                      <li key={s.id} className="flex items-center justify-between py-1.5">
                        <span className="text-slate-700">{s.lastName} {s.firstName}</span>
                        <span className={`tabular-nums font-medium ${bal.balance < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                          {bal.balance} {t('daysUnit')}
                          <span className="ms-1 text-[11px] font-normal text-slate-400">({bal.acquired}−{bal.taken})</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
