import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { ExportButton } from '../comptabilite-client';

type Buckets = { current: number; b30: number; b60: number; b90: number; b90p: number };
const empty = (): Buckets => ({ current: 0, b30: 0, b60: 0, b90: 0, b90p: 0 });

export default async function BalanceAgeePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('admin.comptabilite');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const [unpaid, billedAgg] = await Promise.all([
      tx.installment.findMany({
        where: { status: { in: ['PENDING', 'PARTIAL'] } },
        include: { payments: { select: { amount: true } }, student: { select: { id: true, firstName: true, lastName: true } } },
      }),
      tx.installment.aggregate({ where: { status: { not: 'CANCELLED' } }, _sum: { amount: true } }),
    ]);
    return { unpaid, billed: Number(billedAgg._sum.amount ?? 0) };
  });

  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  const dayMs = 86400000;
  const byStudent = new Map<string, { id: string; name: string; b: Buckets; total: number }>();
  const totals = empty();
  let grandTotal = 0;

  for (const i of data.unpaid) {
    const paid = i.payments.reduce((s, p) => s + Number(p.amount), 0);
    const remaining = Math.round((Number(i.amount) - paid) * 100) / 100;
    if (remaining <= 0) continue;
    const age = Math.floor((today.getTime() - new Date(i.dueDate).getTime()) / dayMs);
    const key = age < 0 ? 'current' : age <= 30 ? 'b30' : age <= 60 ? 'b60' : age <= 90 ? 'b90' : 'b90p';
    const row = byStudent.get(i.studentId) ?? { id: i.studentId, name: `${i.student.lastName} ${i.student.firstName}`, b: empty(), total: 0 };
    row.b[key] += remaining;
    row.total += remaining;
    byStudent.set(i.studentId, row);
    totals[key] += remaining;
    grandTotal += remaining;
  }

  const rows = [...byStudent.values()].sort((a, b) => b.total - a.total);
  const fmt = (n: number) => Math.round(n).toLocaleString(locale);
  const rate = data.billed > 0 ? Math.round((grandTotal / data.billed) * 1000) / 10 : 0;

  return (
    <div className="mx-auto max-w-5xl px-3 py-3">
      <nav className="mb-3 text-xs text-slate-500">
        <Link href={`/${locale}/admin/comptabilite`} className="hover:text-brand-700">📒 {t('title')}</Link>
        <span className="mx-1.5">›</span>
        <span>{t('agingLink')}</span>
      </nav>

      <div className="mb-4 flex items-center justify-between gap-3 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">{t('agingLink')}</h1>
        <ExportButton
          header={['Famille', 'Non echu', '1-30', '31-60', '61-90', '+90', 'Total']}
          rows={rows.map((r) => [r.name, r.b.current.toFixed(2), r.b.b30.toFixed(2), r.b.b60.toFixed(2), r.b.b90.toFixed(2), r.b.b90p.toFixed(2), r.total.toFixed(2)])}
          filename="balance-agee-clients"
          label={t('export')}
        />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label={t('totalDue')} value={fmt(grandTotal)} tone="red" />
        <Kpi label={t('families')} value={String(rows.length)} />
        <Kpi label={t('unpaidRate')} value={`${rate}%`} tone="amber" />
        <Kpi label={t('overdue90')} value={fmt(totals.b90 + totals.b90p)} tone="red" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
            <tr>
              <th className="px-3 py-2.5 text-start">{t('family')}</th>
              <th className="px-3 py-2.5 text-end">{t('notDue')}</th>
              <th className="px-3 py-2.5 text-end">1–30</th>
              <th className="px-3 py-2.5 text-end">31–60</th>
              <th className="px-3 py-2.5 text-end">61–90</th>
              <th className="px-3 py-2.5 text-end">+90</th>
              <th className="px-3 py-2.5 text-end font-semibold">{t('total')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 font-medium text-slate-800">{r.name}</td>
                <td className="px-3 py-2 text-end tabular-nums text-slate-500">{r.b.current ? fmt(r.b.current) : ''}</td>
                <td className="px-3 py-2 text-end tabular-nums text-slate-600">{r.b.b30 ? fmt(r.b.b30) : ''}</td>
                <td className="px-3 py-2 text-end tabular-nums text-amber-700">{r.b.b60 ? fmt(r.b.b60) : ''}</td>
                <td className="px-3 py-2 text-end tabular-nums text-orange-700">{r.b.b90 ? fmt(r.b.b90) : ''}</td>
                <td className="px-3 py-2 text-end tabular-nums text-red-700">{r.b.b90p ? fmt(r.b.b90p) : ''}</td>
                <td className="px-3 py-2 text-end tabular-nums font-semibold text-slate-900">{fmt(r.total)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">{t('noUnpaid')}</td></tr>}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
              <tr>
                <td className="px-3 py-2.5">{t('total')}</td>
                <td className="px-3 py-2.5 text-end tabular-nums">{fmt(totals.current)}</td>
                <td className="px-3 py-2.5 text-end tabular-nums">{fmt(totals.b30)}</td>
                <td className="px-3 py-2.5 text-end tabular-nums">{fmt(totals.b60)}</td>
                <td className="px-3 py-2.5 text-end tabular-nums">{fmt(totals.b90)}</td>
                <td className="px-3 py-2.5 text-end tabular-nums">{fmt(totals.b90p)}</td>
                <td className="px-3 py-2.5 text-end tabular-nums">{fmt(grandTotal)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  const c = tone === 'red' ? 'text-red-700' : tone === 'amber' ? 'text-amber-700' : 'text-slate-800';
  return (
    <div className="rounded-2xl border border-brand-200 bg-white p-3">
      <div className={`text-xl font-bold tabular-nums ${c}`}>{value}</div>
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
    </div>
  );
}
