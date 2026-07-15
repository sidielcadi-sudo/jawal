import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { accountClass } from '@/lib/cgnc-accounts';
import { ExportButton } from '../comptabilite-client';

type Row = { code: string; name: string; debit: number; credit: number; solde: number };

export default async function EtatsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('admin.comptabilite');
  const te = await getTranslations('admin.comptabilite.etats');

  const rows: Row[] = await withTenant(session.user.tenantId, async (tx) => {
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
  const inClass = (c: number) => rows.filter((r) => accountClass(r.code) === c);
  const sum = (rs: Row[], f: (r: Row) => number) => Math.round(rs.reduce((s, r) => s + f(r), 0) * 100) / 100;

  const charges = inClass(6); // débit = charge
  const produits = inClass(7); // crédit = produit
  const totalCharges = sum(charges, (r) => r.debit - r.credit);
  const totalProduits = sum(produits, (r) => r.credit - r.debit);
  const resultat = Math.round((totalProduits - totalCharges) * 100) / 100;

  // Bilan simplifié.
  const actifClasses = [2, 3, 5];
  const passifClasses = [1, 4];
  const actif = rows.filter((r) => actifClasses.includes(accountClass(r.code)) && r.solde > 0);
  const passif = rows.filter((r) => passifClasses.includes(accountClass(r.code)) && r.solde < 0);
  const totalActif = sum(actif, (r) => r.solde);
  const totalPassifBrut = sum(passif, (r) => -r.solde);
  const totalPassif = Math.round((totalPassifBrut + resultat) * 100) / 100;

  // Trésorerie (51xx).
  const treso = rows.filter((r) => r.code.startsWith('51'));
  const tresoSolde = sum(treso, (r) => r.solde);

  // Taux de recouvrement = encaissé / facturé sur les comptes clients (342x).
  const clients = rows.filter((r) => r.code.startsWith('342'));
  const factureClient = sum(clients, (r) => r.debit);
  const encaisseClient = sum(clients, (r) => r.credit);
  const recouvrement = factureClient > 0 ? Math.round((encaisseClient / factureClient) * 1000) / 10 : 0;

  // Balance par classe.
  const classes = [1, 2, 3, 4, 5, 6, 7].map((c) => {
    const rs = inClass(c);
    return { c, debit: sum(rs, (r) => r.debit), credit: sum(rs, (r) => r.credit) };
  }).filter((x) => x.debit || x.credit);

  return (
    <div className="mx-auto max-w-5xl px-3 py-3">
      <nav className="mb-3 text-xs text-slate-500">
        <Link href={`/${locale}/admin/comptabilite`} className="hover:text-brand-700">📒 {t('title')}</Link>
        <span className="mx-1.5">›</span>
        <span>{te('title')}</span>
      </nav>

      <div className="mb-4 flex items-center justify-between gap-3 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">{te('title')}</h1>
        <ExportButton header={['Compte', 'Intitule', 'Debit', 'Credit', 'Solde']} rows={rows.map((r) => [r.code, r.name, r.debit.toFixed(2), r.credit.toFixed(2), r.solde.toFixed(2)])} filename="etats-financiers" label={t('export')} />
      </div>

      {/* KPI direction */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label={te('produits')} value={fmt(totalProduits)} tone="emerald" />
        <Kpi label={te('charges')} value={fmt(totalCharges)} tone="red" />
        <Kpi label={te('resultat')} value={fmt(resultat)} tone={resultat >= 0 ? 'emerald' : 'red'} big />
        <Kpi label={te('treasury')} value={fmt(tresoSolde)} />
        <Kpi label={te('recovery')} value={`${recouvrement}%`} tone="amber" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* CPC */}
        <Panel title={te('cpc')}>
          <Mini rows={produits} fmt={fmt} valueOf={(r) => r.credit - r.debit} total={totalProduits} totalLabel={te('produits')} />
          <div className="my-2 border-t border-slate-100" />
          <Mini rows={charges} fmt={fmt} valueOf={(r) => r.debit - r.credit} total={totalCharges} totalLabel={te('charges')} />
          <div className="mt-2 flex justify-between border-t-2 border-slate-200 pt-2 text-sm font-bold">
            <span>{te('resultat')}</span><span className={`tabular-nums ${resultat >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{fmt(resultat)}</span>
          </div>
        </Panel>

        {/* Bilan simplifié */}
        <Panel title={te('balanceSheet')}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-slate-500">{te('assets')}</div>
              {actif.map((r) => <Line key={r.code} label={`${r.code} ${r.name}`} value={fmt(r.solde)} />)}
              <div className="mt-1 flex justify-between border-t border-slate-100 pt-1 text-sm font-bold"><span>{te('total')}</span><span className="tabular-nums">{fmt(totalActif)}</span></div>
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-slate-500">{te('liabilities')}</div>
              {passif.map((r) => <Line key={r.code} label={`${r.code} ${r.name}`} value={fmt(-r.solde)} />)}
              <Line label={te('result')} value={fmt(resultat)} />
              <div className="mt-1 flex justify-between border-t border-slate-100 pt-1 text-sm font-bold"><span>{te('total')}</span><span className="tabular-nums">{fmt(totalPassif)}</span></div>
            </div>
          </div>
        </Panel>

        {/* Flux de trésorerie */}
        <Panel title={te('cashFlow')}>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-slate-500"><tr><th className="py-1 text-start">{t('account')}</th><th className="py-1 text-end">{te('inflow')}</th><th className="py-1 text-end">{te('outflow')}</th><th className="py-1 text-end">{t('balanceCol')}</th></tr></thead>
            <tbody>
              {treso.map((r) => (
                <tr key={r.code}><td className="py-1 text-slate-700"><span className="font-mono text-xs text-slate-500">{r.code}</span> {r.name}</td><td className="py-1 text-end tabular-nums text-emerald-700">{fmt(r.debit)}</td><td className="py-1 text-end tabular-nums text-red-700">{fmt(r.credit)}</td><td className="py-1 text-end tabular-nums font-medium">{fmt(r.solde)}</td></tr>
              ))}
              {treso.length === 0 && <tr><td colSpan={4} className="py-3 text-center text-xs text-slate-400">—</td></tr>}
            </tbody>
          </table>
        </Panel>

        {/* Balance par classe */}
        <Panel title={te('classBalance')}>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-slate-500"><tr><th className="py-1 text-start">{te('class')}</th><th className="py-1 text-end">{t('debit')}</th><th className="py-1 text-end">{t('credit')}</th></tr></thead>
            <tbody>
              {classes.map((x) => (
                <tr key={x.c}><td className="py-1 text-slate-700">{te(`classes.${x.c}`)}</td><td className="py-1 text-end tabular-nums">{fmt(x.debit)}</td><td className="py-1 text-end tabular-nums">{fmt(x.credit)}</td></tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone, big }: { label: string; value: string; tone?: string; big?: boolean }) {
  const c = tone === 'emerald' ? 'text-emerald-700' : tone === 'red' ? 'text-red-700' : tone === 'amber' ? 'text-amber-700' : 'text-slate-800';
  return (
    <div className={`rounded-2xl border bg-white p-3 ${big ? 'border-brand-300' : 'border-brand-200'}`}>
      <div className={`text-lg font-bold tabular-nums ${c}`}>{value}</div>
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
    </div>
  );
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-brand-200 bg-white p-4"><h2 className="mb-2 text-sm font-semibold text-slate-900">{title}</h2>{children}</section>;
}
function Line({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between py-0.5 text-sm"><span className="min-w-0 truncate text-slate-600">{label}</span><span className="ms-2 tabular-nums text-slate-800">{value}</span></div>;
}
function Mini({ rows, fmt, valueOf, total, totalLabel }: { rows: Row[]; fmt: (n: number) => string; valueOf: (r: Row) => number; total: number; totalLabel: string }) {
  return (
    <div>
      {rows.map((r) => <Line key={r.code} label={`${r.code} ${r.name}`} value={fmt(valueOf(r))} />)}
      <div className="mt-1 flex justify-between border-t border-slate-100 pt-1 text-sm font-semibold"><span>{totalLabel}</span><span className="tabular-nums">{fmt(total)}</span></div>
    </div>
  );
}
