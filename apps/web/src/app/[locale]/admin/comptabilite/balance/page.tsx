import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { ExportButton } from '../comptabilite-client';

export default async function BalancePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('admin.comptabilite');

  const rows = await withTenant(session.user.tenantId, async (tx) => {
    const [grouped, accounts] = await Promise.all([
      tx.journalLine.groupBy({ by: ['accountId'], _sum: { debit: true, credit: true } }),
      tx.account.findMany({ select: { id: true, code: true, name: true } }),
    ]);
    const byId = new Map(accounts.map((a) => [a.id, a]));
    return grouped
      .map((g) => {
        const a = byId.get(g.accountId);
        const debit = Number(g._sum.debit ?? 0);
        const credit = Number(g._sum.credit ?? 0);
        return { code: a?.code ?? '?', name: a?.name ?? '?', debit, credit, solde: Math.round((debit - credit) * 100) / 100 };
      })
      .sort((a, b) => a.code.localeCompare(b.code));
  });

  const fmt = (n: number) => n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const totals = rows.reduce((a, r) => ({ d: a.d + r.debit, c: a.c + r.credit }), { d: 0, c: 0 });

  return (
    <div className="mx-auto max-w-4xl px-3 py-3">
      <nav className="mb-3 text-xs text-slate-500">
        <Link href={`/${locale}/admin/comptabilite`} className="hover:text-brand-700">📒 {t('title')}</Link>
        <span className="mx-1.5">›</span>
        <span>{t('balanceLink')}</span>
      </nav>

      <div className="mb-4 flex items-center justify-between gap-3 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">{t('balanceLink')}</h1>
        <ExportButton header={['Compte', 'Intitule', 'Debit', 'Credit', 'Solde']} rows={rows.map((r) => [r.code, r.name, r.debit.toFixed(2), r.credit.toFixed(2), r.solde.toFixed(2)])} filename="balance-generale" label={t('export')} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
            <tr>
              <th className="px-4 py-2.5 text-start">{t('account')}</th>
              <th className="px-4 py-2.5 text-end">{t('debit')}</th>
              <th className="px-4 py-2.5 text-end">{t('credit')}</th>
              <th className="px-4 py-2.5 text-end">{t('balanceCol')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.code}>
                <td className="px-4 py-2"><span className="font-mono text-xs text-slate-500">{r.code}</span> <span className="text-slate-700">{r.name}</span></td>
                <td className="px-4 py-2 text-end tabular-nums text-slate-600">{r.debit ? fmt(r.debit) : ''}</td>
                <td className="px-4 py-2 text-end tabular-nums text-slate-600">{r.credit ? fmt(r.credit) : ''}</td>
                <td className={`px-4 py-2 text-end tabular-nums font-medium ${r.solde >= 0 ? 'text-slate-800' : 'text-red-600'}`}>{fmt(r.solde)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">{t('noEntries')}</td></tr>}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
              <tr>
                <td className="px-4 py-2.5">{t('total')}</td>
                <td className="px-4 py-2.5 text-end tabular-nums">{fmt(totals.d)}</td>
                <td className="px-4 py-2.5 text-end tabular-nums">{fmt(totals.c)}</td>
                <td className="px-4 py-2.5 text-end tabular-nums">{Math.abs(totals.d - totals.c) < 0.01 ? '✓' : fmt(totals.d - totals.c)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
