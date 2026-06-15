import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import {
  FeeCreateForm,
  FeeRowActions,
  DiscountCreateForm,
  DiscountRowActions,
} from './client';

export default async function FeesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.settings.fees');

  const session = (await auth())!;
  const { fees, years, levels, currency, discounts } = await withTenant(
    session.user.tenantId,
    async (tx) => {
      const [fees, years, levels, tenant, discounts] = await Promise.all([
        tx.feeScheduleItem.findMany({
          include: {
            academicYear: { select: { label: true } },
          },
          orderBy: [{ academicYearId: 'desc' }, { label: 'asc' }],
        }),
        tx.academicYear.findMany({ orderBy: { startDate: 'desc' } }),
        tx.level.findMany({ include: { cycle: true }, orderBy: { order: 'asc' } }),
        tx.tenant.findFirst(),
        tx.discountRule.findMany({ orderBy: [{ order: 'asc' }, { label: 'asc' }] }),
      ]);
      const levelMap = new Map(levels.map((l) => [l.id, l]));
      return {
        fees: fees.map((f) => ({
          ...f,
          levelLabel: levelMap.get(f.levelId)?.label ?? f.levelId.slice(0, 8),
          totalAmount: Number(f.totalAmount),
        })),
        years,
        levels,
        currency: tenant?.currency ?? 'MAD',
        discounts: discounts.map((d) => ({
          id: d.id,
          label: d.label,
          pct: Number(d.pct),
          active: d.active,
          order: d.order,
        })),
      };
    },
  );

  const td = await getTranslations('admin.settings.fees.discounts');

  return (
    <div className="space-y-6">
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <section className="lg:col-span-2">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-start">{t('table.year')}</th>
                <th className="px-4 py-3 text-start">{t('table.level')}</th>
                <th className="px-4 py-3 text-start">{t('table.label')}</th>
                <th className="px-4 py-3 text-end">{t('table.totalAmount')}</th>
                <th className="px-4 py-3 text-end">{t('table.installments')}</th>
                <th className="px-4 py-3 text-end">{t('table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fees.map((f) => (
                <tr key={f.id}>
                  <td className="px-4 py-3 text-xs text-slate-600">{f.academicYear.label}</td>
                  <td className="px-4 py-3 text-xs">{f.levelLabel}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{f.label}</td>
                  <td className="px-4 py-3 text-end tabular-nums">
                    {f.totalAmount.toLocaleString(locale, { minimumFractionDigits: 2 })} {currency}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums text-slate-600">
                    {f.installmentCount}× ({(f.totalAmount / f.installmentCount).toFixed(2)})
                  </td>
                  <td className="px-4 py-3 text-end">
                    <FeeRowActions
                      id={f.id}
                      currency={currency}
                      initial={{
                        label: f.label,
                        totalAmount: f.totalAmount,
                        installmentCount: f.installmentCount,
                        firstDueMonth: f.firstDueMonth,
                      }}
                    />
                  </td>
                </tr>
              ))}
              {fees.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    {t('empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <aside>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-900">{t('create')}</h2>
          <p className="mt-1 text-xs text-slate-500">{t('createHint')}</p>
          <div className="mt-4">
            <FeeCreateForm
              years={years.map((y) => ({ id: y.id, label: y.label, active: y.active }))}
              levels={levels.map((l) => ({ id: l.id, label: `${l.cycle.label} — ${l.label}` }))}
              currency={currency}
            />
          </div>
        </div>
      </aside>
    </div>

    {/* Réductions paramétrables (#1/#5) */}
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <section className="lg:col-span-2">
        <h2 className="mb-2 text-base font-semibold text-slate-900">{td('title')}</h2>
        <p className="mb-3 text-xs text-slate-500">{td('subtitle')}</p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-start">{td('label')}</th>
                <th className="px-4 py-3 text-end">{td('pct')}</th>
                <th className="px-4 py-3 text-center">{td('active')}</th>
                <th className="px-4 py-3 text-end">{t('table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {discounts.map((d) => (
                <tr key={d.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{d.label}</td>
                  <td className="px-4 py-3 text-end tabular-nums">−{d.pct}%</td>
                  <td className="px-4 py-3 text-center">
                    {d.active ? (
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                        {td('on')}
                      </span>
                    ) : (
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                        {td('off')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-end">
                    <DiscountRowActions id={d.id} initial={d} />
                  </td>
                </tr>
              ))}
              {discounts.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                    {td('empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <aside>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-900">{td('create')}</h2>
          <p className="mt-1 text-xs text-slate-500">{td('createHint')}</p>
          <div className="mt-4">
            <DiscountCreateForm />
          </div>
        </div>
      </aside>
    </div>
    </div>
  );
}
