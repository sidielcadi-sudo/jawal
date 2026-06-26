import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { GeneratePayrollForm, RunWorkflowButtons, DeleteRunButton } from '../runs-client';

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  CALCULATED: 'bg-amber-100 text-amber-700',
  RH_VALIDATED: 'bg-sky-100 text-sky-700',
  DIRECTION_APPROVED: 'bg-indigo-100 text-indigo-700',
  CLOSED: 'bg-emerald-100 text-emerald-700',
};

export default async function PayrollRunsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('admin.payroll');
  const tr = await getTranslations('admin.payroll.run');

  const runs = await withTenant(session.user.tenantId, (tx) =>
    tx.payrollRun.findMany({
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: { _count: { select: { payslips: true } }, payslips: { select: { netPayable: true, employerCost: true } } },
    }),
  );

  return (
    <div className="px-3 py-3">
      <nav className="mb-3 text-xs text-slate-500">
        <Link href={`/${locale}/admin/payroll`} className="hover:text-brand-700">💼 {t('title')}</Link>
        <span className="mx-1.5">›</span>
        <span>{tr('title')}</span>
      </nav>

      <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">{tr('generateTitle')}</h2>
        <GeneratePayrollForm />
      </section>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5 text-start">{tr('period')}</th>
              <th className="px-4 py-2.5 text-end">{tr('payslips')}</th>
              <th className="px-4 py-2.5 text-end">{tr('netTotal')}</th>
              <th className="px-4 py-2.5 text-end">{tr('costTotal')}</th>
              <th className="px-4 py-2.5 text-center">{tr('status')}</th>
              <th className="px-4 py-2.5 text-end">{tr('actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {runs.map((r) => {
              const net = r.payslips.reduce((s, p) => s + p.netPayable, 0);
              const cost = r.payslips.reduce((s, p) => s + p.employerCost, 0);
              return (
                <tr key={r.id}>
                  <td className="px-4 py-2.5 font-medium text-slate-900">
                    <Link href={`/${locale}/admin/payroll/runs/${r.id}`} className="hover:text-brand-700 hover:underline">
                      {tr(`months.${r.month}`)} {r.year}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-end tabular-nums text-slate-600">{r._count.payslips}</td>
                  <td className="px-4 py-2.5 text-end tabular-nums text-slate-700">{Math.round(net).toLocaleString(locale)}</td>
                  <td className="px-4 py-2.5 text-end tabular-nums text-slate-500">{Math.round(cost).toLocaleString(locale)}</td>
                  <td className="px-4 py-2.5 text-center"><span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_BADGE[r.status]}`}>{tr(`statusLabel.${r.status}`)}</span></td>
                  <td className="px-4 py-2.5">
                    <span className="flex items-center justify-end gap-2">
                      <RunWorkflowButtons runId={r.id} status={r.status} />
                      {r.status !== 'CLOSED' && <DeleteRunButton runId={r.id} />}
                    </span>
                  </td>
                </tr>
              );
            })}
            {runs.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">{tr('empty')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
