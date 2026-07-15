import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { CreateForm } from '../comptabilite-client';
import { PayInvoiceForm, InvoiceDeleteButton } from './achats-client';
import { createSupplierAction, createInvoiceAction } from './actions';

const inputCls = 'rounded-lg border border-slate-300 px-3 py-2 text-sm';
const STATUS: Record<string, string> = { UNPAID: 'bg-red-100 text-red-700', PARTIAL: 'bg-amber-100 text-amber-700', PAID: 'bg-emerald-100 text-emerald-700' };

export default async function AchatsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('admin.comptabilite');
  const ta = await getTranslations('admin.comptabilite.achats');

  const { suppliers, invoices, chargeAccounts, currency } = await withTenant(session.user.tenantId, async (tx) => {
    const [suppliers, invoices, accounts, tenant] = await Promise.all([
      tx.supplier.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
      tx.supplierInvoice.findMany({ orderBy: [{ status: 'asc' }, { dueDate: 'asc' }], include: { supplier: { select: { name: true } }, payments: { select: { amount: true } } }, take: 200 }),
      tx.account.findMany({ where: { active: true, code: { startsWith: '6' } }, orderBy: { code: 'asc' }, select: { code: true, name: true } }),
      tx.tenant.findFirst({ select: { currency: true } }),
    ]);
    return { suppliers, invoices, chargeAccounts: accounts, currency: tenant?.currency ?? 'MAD' };
  });

  const fmt = (n: number) => n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // Balance âgée fournisseurs (factures non soldées).
  const today = Date.now();
  const aging = { current: 0, b30: 0, b60: 0, b90p: 0 };
  for (const inv of invoices) {
    if (inv.status === 'PAID') continue;
    const remaining = Number(inv.amount) - inv.payments.reduce((s, p) => s + Number(p.amount), 0);
    if (remaining <= 0) continue;
    const age = Math.floor((today - new Date(inv.dueDate).getTime()) / 86400000);
    if (age < 0) aging.current += remaining; else if (age <= 30) aging.b30 += remaining; else if (age <= 90) aging.b60 += remaining; else aging.b90p += remaining;
  }
  const totalDue = aging.current + aging.b30 + aging.b60 + aging.b90p;

  return (
    <div className="px-3 py-3">
      <nav className="mb-3 text-xs text-slate-500">
        <Link href={`/${locale}/admin/comptabilite`} className="hover:text-brand-700">📒 {t('title')}</Link>
        <span className="mx-1.5">›</span>
        <span>{ta('title')}</span>
      </nav>

      <div className="mb-4 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">{ta('title')}</h1>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label={ta('totalDue')} value={fmt(totalDue)} tone="red" />
        <Kpi label="≤ 30 j" value={fmt(aging.b30)} />
        <Kpi label="31–90 j" value={fmt(aging.b60)} tone="amber" />
        <Kpi label="+90 j" value={fmt(aging.b90p)} tone="red" />
      </div>

      {/* Facture fournisseur */}
      <section className="mb-4 rounded-2xl border border-brand-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">{ta('newInvoice')}</h2>
        <CreateForm action={createInvoiceAction} className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <select name="supplierId" required defaultValue="" className={inputCls}>
            <option value="" disabled>{ta('supplier')}</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input name="label" required placeholder={ta('label')} className={inputCls} />
          <select name="accountCode" required defaultValue="" className={inputCls}>
            <option value="" disabled>{ta('chargeAccount')}</option>
            {chargeAccounts.map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
          </select>
          <input name="amount" type="number" step="0.01" required placeholder={ta('amount')} className={inputCls} />
          <input name="number" placeholder={ta('number')} className={inputCls} />
          <label className="text-[11px] text-slate-500">{ta('date')}<input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={`w-full ${inputCls}`} /></label>
          <label className="text-[11px] text-slate-500">{ta('dueDate')}<input name="dueDate" type="date" className={`w-full ${inputCls}`} /></label>
          <button className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">{ta('addInvoice')}</button>
        </CreateForm>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        {/* Factures */}
        <section className="lg:col-span-3">
          <h2 className="mb-2 text-base font-semibold text-slate-900">{ta('invoices')}</h2>
          <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
                <tr>
                  <th className="px-3 py-2 text-start">{ta('supplier')}</th>
                  <th className="px-3 py-2 text-start">{ta('label')}</th>
                  <th className="px-3 py-2 text-end">{ta('amount')}</th>
                  <th className="px-3 py-2 text-end">{ta('remaining')}</th>
                  <th className="px-3 py-2 text-center">{ta('status')}</th>
                  <th className="px-3 py-2 text-end">{ta('payment')}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((inv) => {
                  const remaining = Number(inv.amount) - inv.payments.reduce((s, p) => s + Number(p.amount), 0);
                  return (
                    <tr key={inv.id}>
                      <td className="px-3 py-2 font-medium text-slate-800">{inv.supplier.name}</td>
                      <td className="px-3 py-2 text-xs text-slate-600">{inv.label} <span className="text-slate-400">· {inv.accountCode}</span></td>
                      <td className="px-3 py-2 text-end tabular-nums text-slate-700">{fmt(Number(inv.amount))}</td>
                      <td className="px-3 py-2 text-end tabular-nums text-red-700">{remaining > 0 ? fmt(remaining) : ''}</td>
                      <td className="px-3 py-2 text-center"><span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS[inv.status]}`}>{ta(`statusLabel.${inv.status}`)}</span></td>
                      <td className="px-3 py-2">{inv.status !== 'PAID' && <PayInvoiceForm invoiceId={inv.id} remaining={remaining} />}</td>
                      <td className="px-3 py-2 text-end">{inv.payments.length === 0 && <InvoiceDeleteButton id={inv.id} />}</td>
                    </tr>
                  );
                })}
                {invoices.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">{ta('noInvoices')}</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        {/* Fournisseurs */}
        <aside>
          <h2 className="mb-2 text-base font-semibold text-slate-900">{ta('suppliers')}</h2>
          <section className="rounded-2xl border border-brand-200 bg-white p-4">
            <CreateForm action={createSupplierAction} className="mb-3 space-y-1.5">
              <input name="name" required placeholder={ta('supplierName')} className={`w-full ${inputCls}`} />
              <div className="flex gap-1.5">
                <input name="ice" placeholder="ICE" className={`w-full ${inputCls}`} />
                <button className="rounded-lg bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700">+</button>
              </div>
            </CreateForm>
            <ul className="divide-y divide-slate-100 text-sm">
              {suppliers.map((s) => <li key={s.id} className="py-1.5 text-slate-700">{s.name}{s.ice && <span className="ms-1.5 text-xs text-slate-400">{s.ice}</span>}</li>)}
              {suppliers.length === 0 && <li className="py-3 text-center text-xs text-slate-400">{ta('noSuppliers')}</li>}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  const c = tone === 'red' ? 'text-red-700' : tone === 'amber' ? 'text-amber-700' : 'text-slate-800';
  return (
    <div className="rounded-2xl border border-brand-200 bg-white p-3">
      <div className={`text-lg font-bold tabular-nums ${c}`}>{value}</div>
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
    </div>
  );
}
