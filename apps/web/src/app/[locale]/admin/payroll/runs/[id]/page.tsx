import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { RunWorkflowButtons } from '../../runs-client';
import { JournalExportButton } from '../../journal-export';
import { buildJournal, journalTotals, type AccountMapping } from '@/lib/payroll-journal';

export default async function PayrollRunDetail({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('admin.payroll');
  const tr = await getTranslations('admin.payroll.run');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const run = await tx.payrollRun.findUnique({
      where: { id },
      include: { payslips: { include: { person: { select: { firstName: true, lastName: true, serviceRef: { select: { labelFr: true } } } } }, orderBy: { person: { lastName: 'asc' } } } },
    });
    const config = await tx.payrollConfig.findFirst({ orderBy: { effectiveFrom: 'desc' }, select: { accountMapping: true } });
    return { run, config };
  });
  if (!data.run) notFound();
  const { run, config } = data;

  const fmt = (n: number) => Math.round(n).toLocaleString(locale);
  const totals = run.payslips.reduce(
    (a, p) => {
      const b = p.breakdown as Record<string, number>;
      const social = (b.cnss ?? 0) + (b.amo ?? 0) + (b.cimr ?? 0) + (b.cnssEmployer ?? 0) + (b.familyAllowance ?? 0) + (b.amoEmployer ?? 0) + (b.trainingTax ?? 0);
      return {
        brut: a.brut + p.brut, cnss: a.cnss + (b.cnss ?? 0), amo: a.amo + (b.amo ?? 0), ir: a.ir + p.irNet,
        net: a.net + p.netPayable, cost: a.cost + p.employerCost,
        employerCharges: a.employerCharges + (b.employerCharges ?? 0), social: a.social + social, internal: a.internal + (b.internalDeductions ?? 0),
      };
    },
    { brut: 0, cnss: 0, amo: 0, ir: 0, net: 0, cost: 0, employerCharges: 0, social: 0, internal: 0 },
  );

  // Journal comptable (mapping de comptes CGNC paramétré).
  const mapping = (config?.accountMapping ?? {}) as AccountMapping;
  const journal = buildJournal(
    { brut: totals.brut, employerCharges: totals.employerCharges, net: totals.net, socialBothShares: totals.social, ir: totals.ir, internal: totals.internal },
    mapping,
  );
  const jt = journalTotals(journal);

  // Coût par département (Service).
  const byDept = new Map<string, number>();
  for (const p of run.payslips) {
    const dep = p.person.serviceRef?.labelFr ?? '—';
    byDept.set(dep, (byDept.get(dep) ?? 0) + p.employerCost);
  }
  const deptRows = [...byDept.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="px-3 py-3">
      <nav className="mb-3 text-xs text-slate-500">
        <Link href={`/${locale}/admin/payroll/runs`} className="hover:text-brand-700">💼 {tr('title')}</Link>
        <span className="mx-1.5">›</span>
        <span>{tr(`months.${run.month}`)} {run.year}</span>
      </nav>

      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-base font-bold text-slate-900">{tr(`months.${run.month}`)} {run.year}</h1>
        <RunWorkflowButtons runId={run.id} status={run.status} />
      </div>

      {/* KPI */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label={tr('kpiMass')} value={fmt(totals.brut)} />
        <Kpi label={tr('kpiCharges')} value={fmt(totals.employerCharges)} />
        <Kpi label={tr('kpiNet')} value={fmt(totals.net)} />
        <Kpi label={tr('kpiCost')} value={fmt(totals.cost)} accent />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
            <tr>
              <th className="px-3 py-2.5 text-start">{t('employee')}</th>
              <th className="px-3 py-2.5 text-end">{tr('brut')}</th>
              <th className="px-3 py-2.5 text-end">CNSS</th>
              <th className="px-3 py-2.5 text-end">AMO</th>
              <th className="px-3 py-2.5 text-end">{tr('ir')}</th>
              <th className="px-3 py-2.5 text-end">{tr('netImposable')}</th>
              <th className="px-3 py-2.5 text-end font-semibold">{tr('netPayable')}</th>
              <th className="px-3 py-2.5 text-end">{tr('employerCost')}</th>
              <th className="px-3 py-2.5 text-center">{tr('payslip')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {run.payslips.map((p) => {
              const b = p.breakdown as { cnss: number; amo: number };
              return (
                <tr key={p.id}>
                  <td className="px-3 py-2 font-medium text-slate-800">{p.person.lastName} {p.person.firstName}</td>
                  <td className="px-3 py-2 text-end tabular-nums text-slate-700">{fmt(p.brut)}</td>
                  <td className="px-3 py-2 text-end tabular-nums text-slate-500">{fmt(b.cnss ?? 0)}</td>
                  <td className="px-3 py-2 text-end tabular-nums text-slate-500">{fmt(b.amo ?? 0)}</td>
                  <td className="px-3 py-2 text-end tabular-nums text-slate-500">{fmt(p.irNet)}</td>
                  <td className="px-3 py-2 text-end tabular-nums text-slate-500">{fmt(p.netImposable)}</td>
                  <td className="px-3 py-2 text-end tabular-nums font-semibold text-slate-900">{fmt(p.netPayable)}</td>
                  <td className="px-3 py-2 text-end tabular-nums text-slate-500">{fmt(p.employerCost)}</td>
                  <td className="px-3 py-2 text-center text-xs">
                    <a href={`/api/admin/payroll/payslip/${p.id}/pdf?lang=fr`} target="_blank" className="text-brand-600 hover:underline">FR</a>
                    <span className="mx-1 text-slate-300">·</span>
                    <a href={`/api/admin/payroll/payslip/${p.id}/pdf?lang=ar`} target="_blank" className="text-brand-600 hover:underline">AR</a>
                  </td>
                </tr>
              );
            })}
            {run.payslips.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400">{tr('noPayslips')}</td></tr>}
          </tbody>
          {run.payslips.length > 0 && (
            <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-800">
              <tr>
                <td className="px-3 py-2.5">{tr('total')}</td>
                <td className="px-3 py-2.5 text-end tabular-nums">{fmt(totals.brut)}</td>
                <td className="px-3 py-2.5 text-end tabular-nums">{fmt(totals.cnss)}</td>
                <td className="px-3 py-2.5 text-end tabular-nums">{fmt(totals.amo)}</td>
                <td className="px-3 py-2.5 text-end tabular-nums">{fmt(totals.ir)}</td>
                <td className="px-3 py-2.5" />
                <td className="px-3 py-2.5 text-end tabular-nums">{fmt(totals.net)}</td>
                <td className="px-3 py-2.5 text-end tabular-nums">{fmt(totals.cost)}</td>
                <td className="px-3 py-2.5" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="mt-3 text-[11px] text-slate-400">{tr('massHint', { mass: fmt(totals.cost) })}</p>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Journal de paie */}
        <section className="lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">{tr('journalTitle')}</h2>
            <JournalExportButton
              rows={journal.map((l) => [l.account, l.label, l.debit, l.credit])}
              filename={`journal-paie-${run.year}-${String(run.month).padStart(2, '0')}`}
            />
          </div>
          <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
                <tr>
                  <th className="px-3 py-2 text-start">{tr('account')}</th>
                  <th className="px-3 py-2 text-start">{tr('label')}</th>
                  <th className="px-3 py-2 text-end">{tr('debit')}</th>
                  <th className="px-3 py-2 text-end">{tr('credit')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {journal.map((l, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 font-mono text-xs text-slate-700">{l.account}</td>
                    <td className="px-3 py-2 text-slate-700">{l.label}</td>
                    <td className="px-3 py-2 text-end tabular-nums text-slate-600">{l.debit ? fmt(l.debit) : ''}</td>
                    <td className="px-3 py-2 text-end tabular-nums text-slate-600">{l.credit ? fmt(l.credit) : ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                <tr>
                  <td className="px-3 py-2" colSpan={2}>{tr('total')} {jt.balanced ? '✓' : '⚠'}</td>
                  <td className="px-3 py-2 text-end tabular-nums">{fmt(jt.debit)}</td>
                  <td className="px-3 py-2 text-end tabular-nums">{fmt(jt.credit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* Coût par département */}
        <aside>
          <h2 className="mb-2 text-base font-semibold text-slate-900">{tr('byDept')}</h2>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <ul className="divide-y divide-slate-100 text-sm">
              {deptRows.map(([dep, cost]) => (
                <li key={dep} className="flex items-center justify-between py-1.5">
                  <span className="text-slate-700">{dep}</span>
                  <span className="tabular-nums text-slate-600">{fmt(cost)}</span>
                </li>
              ))}
              {deptRows.length === 0 && <li className="py-3 text-center text-xs text-slate-400">—</li>}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-3 ${accent ? 'border-brand-200 bg-brand-50' : 'border-slate-200 bg-white'}`}>
      <div className={`text-xl font-bold tabular-nums ${accent ? 'text-brand-700' : 'text-slate-800'}`}>{value}</div>
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
    </div>
  );
}
