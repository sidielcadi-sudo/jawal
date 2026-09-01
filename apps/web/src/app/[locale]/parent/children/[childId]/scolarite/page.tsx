import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { loadParentChildContext } from '@/lib/parent';
import { loadStudentPendingFees } from '@/lib/exceptional-fees';
import { cmiConfigured } from '@/lib/cmi';
import { FeeConsentButtons } from '../fee-consent';
import { PayOnline } from '../pay-online';

const STATUS_TONE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  PARTIAL: 'bg-blue-100 text-blue-700',
  PAID: 'bg-emerald-100 text-emerald-700',
};

export default async function ParentChildScolaritePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; childId: string }>;
  searchParams: Promise<{ payment?: string }>;
}) {
  const { locale, childId } = await params;
  const { payment } = await searchParams;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('parent.child');
  const tp = await getTranslations('parent.child.pay');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const ctx = await loadParentChildContext(tx, session.user.id, childId);
    if (!ctx) return null;
    const installments = await tx.installment.findMany({
      where: { studentId: childId, status: { not: 'CANCELLED' } },
      include: { payments: { select: { amount: true } } },
      orderBy: { dueDate: 'asc' },
    });
    // Échéance dépassée : on compte les jours pleins depuis la date d'échéance,
    // en repartant de minuit pour que « aujourd'hui » ne soit jamais en retard.
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const fees = installments.map((i) => {
      const paid = i.payments.reduce((s, p) => s + Number(p.amount), 0);
      const remaining = Math.max(0, Number(i.amount) - paid);
      const lateMs = midnight.getTime() - new Date(i.dueDate).setHours(0, 0, 0, 0);
      return {
        id: i.id,
        label: i.label,
        amount: Number(i.amount),
        remaining,
        dueDate: i.dueDate,
        overdueDays: remaining > 0 && lateMs > 0 ? Math.floor(lateMs / 86400000) : 0,
        status: i.status as 'PENDING' | 'PARTIAL' | 'PAID',
      };
    });
    const totalDue = fees.reduce((s, f) => s + f.amount, 0);
    const totalPaid = fees.reduce((s, f) => s + (f.amount - f.remaining), 0);
    const pendingFees = await loadStudentPendingFees(tx, childId);
    return { fees, totalDue, totalPaid, totalRemaining: Math.max(0, totalDue - totalPaid), pendingFees };
  });
  if (!data) notFound();

  const tx = await getTranslations('parent.child.exceptionalFees');

  const payableFees = data.fees.filter((f) => f.remaining > 0).map((f) => ({ id: f.id, label: f.label, remaining: f.remaining }));

  return (
    <div className="space-y-4">
      {payment === 'success' && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{tp('successBanner')}</div>
      )}
      {payment === 'failed' && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{tp('failedBanner')}</div>
      )}

      {data.pendingFees.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
          <h2 className="text-sm font-semibold text-amber-900">{tx('title')}</h2>
          <p className="mt-0.5 text-xs text-amber-800/80">{tx('subtitle')}</p>
          <ul className="mt-3 space-y-2">
            {data.pendingFees.map((f) => (
              <li
                key={f.assignmentId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-800">{f.label}</div>
                  <div className="text-xs text-slate-500">
                    {f.typeFr ? `${f.typeFr} · ` : ''}
                    <span className="font-medium text-slate-700">{f.amount.toLocaleString(locale)} MAD</span>
                    {f.activityDate ? ` · ${new Date(f.activityDate).toLocaleDateString(locale)}` : ''}
                  </div>
                  {f.description && <p className="mt-1 text-xs text-slate-500">{f.description}</p>}
                </div>
                <FeeConsentButtons assignmentId={f.assignmentId} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-slate-100 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">{t('finance.title')}</h2>
        <span className="text-xs text-slate-500">
          {t('finance.paidOf', {
            paid: data.totalPaid.toLocaleString(locale),
            due: data.totalDue.toLocaleString(locale),
          })}
        </span>
      </div>
      {data.fees.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">{t('finance.empty')}</p>
      ) : (
        <>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase text-slate-500">
                <th className="py-2 text-start font-medium">{t('finance.label')}</th>
                <th className="py-2 text-end font-medium">{t('finance.dueDate')}</th>
                <th className="py-2 text-end font-medium">{t('finance.amount')}</th>
                <th className="py-2 text-end font-medium">{t('finance.remaining')}</th>
                <th className="py-2 text-center font-medium">{t('finance.status')}</th>
                <th className="py-2 text-end font-medium">{t('finance.receipt')}</th>
              </tr>
            </thead>
            <tbody>
              {data.fees.map((f) => (
                <tr key={f.id} className="border-b border-slate-100">
                  <td className="py-2 text-slate-800">{f.label}</td>
                  <td className={`py-2 text-end tabular-nums ${f.overdueDays > 0 ? 'text-red-600' : 'text-slate-500'}`}>
                    {new Date(f.dueDate).toLocaleDateString(locale)}
                    {f.overdueDays > 0 && (
                      <span className="block text-[10px] font-medium text-red-600">
                        {t('finance.overdue', { days: f.overdueDays })}
                      </span>
                    )}
                  </td>
                  <td className={`py-2 text-end tabular-nums ${f.overdueDays > 0 ? 'font-semibold text-red-600' : ''}`}>
                    {f.amount.toLocaleString(locale)}
                  </td>
                  <td className={`py-2 text-end font-medium tabular-nums ${f.overdueDays > 0 ? 'font-semibold text-red-600' : ''}`}>
                    {f.remaining > 0 ? f.remaining.toLocaleString(locale) : '—'}
                  </td>
                  <td className="py-2 text-center">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${STATUS_TONE[f.status]}`}>
                      {t(`finance.statuses.${f.status}`)}
                    </span>
                  </td>
                  <td className="py-2 text-end">
                    {f.status === 'PENDING' ? (
                      <span className="text-xs text-slate-300">—</span>
                    ) : (
                      <a
                        href={`/api/admin/installments/${f.id}/receipt.pdf`}
                        className="text-xs font-medium text-brand-700 hover:underline"
                      >
                        ⬇ {t('finance.receipt')}
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
            <span className="text-sm font-medium text-slate-700">{t('finance.totalRemaining')}</span>
            <span
              className={`text-lg font-semibold tabular-nums ${
                data.totalRemaining > 0 ? 'text-amber-700' : 'text-emerald-700'
              }`}
            >
              {data.totalRemaining.toLocaleString(locale)} MAD
            </span>
          </div>
        </>
      )}
      </section>

      {payableFees.length > 0 && (
        <PayOnline childId={childId} fees={payableFees} currency="MAD" configured={cmiConfigured()} />
      )}
    </div>
  );
}
