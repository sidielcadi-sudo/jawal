import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { withTenant } from '@/lib/db';
import { CreateExpenseForm, ExpenseRowActions } from './client';

export default async function ExpensesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission('finance.write');
  const t = await getTranslations('admin.finance.expenses');
  const session = (await auth())!;

  const { expenses, total, currency } = await withTenant(session.user.tenantId, async (tx) => {
    const [rows, tenant] = await Promise.all([
      tx.expense.findMany({ orderBy: { date: 'desc' }, take: 200 }),
      tx.tenant.findFirst({ select: { currency: true } }),
    ]);
    return {
      expenses: rows.map((e) => ({
        id: e.id,
        label: e.label,
        category: e.category,
        amount: Number(e.amount),
        date: e.date,
        method: e.method,
      })),
      total: rows.reduce((s, e) => s + Number(e.amount), 0),
      currency: tenant?.currency ?? 'MAD',
    };
  });

  const fmt = (n: number) => n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="px-3 py-3">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
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
          <div className="mb-3 flex items-center justify-between rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
            <span className="text-sm font-medium text-slate-700">{t('total')}</span>
            <span className="text-lg font-semibold tabular-nums text-red-700">
              {fmt(total)} {currency}
            </span>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 table-head text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-start">{t('table.date')}</th>
                  <th className="px-4 py-3 text-start">{t('table.label')}</th>
                  <th className="px-4 py-3 text-start">{t('table.category')}</th>
                  <th className="px-4 py-3 text-end">{t('table.amount')}</th>
                  <th className="px-4 py-3 text-end">{t('table.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenses.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                      {new Date(e.date).toLocaleDateString(locale)}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">{e.label}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{t(`categories.${e.category}`)}</td>
                    <td className="px-4 py-3 text-end tabular-nums text-red-700">
                      {fmt(e.amount)} {currency}
                    </td>
                    <td className="px-4 py-3 text-end">
                      <ExpenseRowActions id={e.id} />
                    </td>
                  </tr>
                ))}
                {expenses.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                      {t('empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside>
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">{t('create')}</h2>
            <p className="mt-1 text-xs text-slate-500">{t('createHint')}</p>
            <div className="mt-4">
              <CreateExpenseForm currency={currency} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
