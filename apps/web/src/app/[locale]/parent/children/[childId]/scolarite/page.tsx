import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { loadParentChildContext } from '@/lib/parent';
import { loadStudentPendingFees } from '@/lib/exceptional-fees';
import { cmiConfigured } from '@/lib/cmi';
import { feeTab, feeTone, SOON_DAYS, type FeeTone } from '@/lib/parent-fees';
import { FeeConsentButtons } from '../fee-consent';
import { PayOnline } from '../pay-online';
import { ChildTabs } from '../tabs';

const STATUS_TONE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  PARTIAL: 'bg-blue-100 text-blue-700',
  PAID: 'bg-emerald-100 text-emerald-700',
};

/** Couleur de la ligne : vert payée, rouge échue non payée, orange bientôt due. */
const ROW_TONE: Record<FeeTone, string> = {
  paid: 'bg-emerald-50 text-emerald-800',
  overdue: 'bg-red-50 text-red-700',
  soon: 'bg-amber-50 text-amber-800',
  upcoming: 'text-slate-700',
};

/**
 * Règlement : deux onglets, l'année scolaire active et les créances des
 * années antérieures, chacun trié par date d'échéance.
 */
export default async function ParentChildScolaritePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; childId: string }>;
  searchParams: Promise<{ payment?: string; tab?: string }>;
}) {
  const { locale, childId } = await params;
  const { payment, tab: tabParam } = await searchParams;
  const tab = tabParam === 'previous' ? 'previous' : 'current';
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('parent.child');
  const tp = await getTranslations('parent.child.pay');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const ctx = await loadParentChildContext(tx, session.user.id, childId);
    if (!ctx) return null;
    const [installments, years] = await Promise.all([
      tx.installment.findMany({
        where: { studentId: childId, status: { not: 'CANCELLED' } },
        include: {
          payments: { select: { amount: true } },
          exceptionalFeeAssignment: { select: { exceptionalFee: { select: { academicYearId: true } } } },
        },
        orderBy: { dueDate: 'asc' },
      }),
      tx.academicYear.findMany({ select: { id: true, label: true, active: true, startDate: true, endDate: true } }),
    ]);
    const activeYear = years.find((y) => y.active) ?? null;
    const today = new Date();
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
        tone: feeTone(remaining, i.dueDate, today),
        tab: feeTab(
          { dueDate: i.dueDate, declaredYearId: i.exceptionalFeeAssignment?.exceptionalFee.academicYearId ?? null },
          years,
          activeYear,
        ),
      };
    });
    const pendingFees = await loadStudentPendingFees(tx, childId);
    return { fees, activeYearLabel: activeYear?.label ?? null, pendingFees };
  });
  if (!data) notFound();

  const tx = await getTranslations('parent.child.exceptionalFees');
  const shown = data.fees.filter((f) => f.tab === tab);
  const totalDue = shown.reduce((s, f) => s + f.amount, 0);
  const totalPaid = shown.reduce((s, f) => s + (f.amount - f.remaining), 0);
  const totalRemaining = Math.max(0, totalDue - totalPaid);
  const previousCount = data.fees.filter((f) => f.tab === 'previous' && f.remaining > 0).length;

  const payableFees = data.fees.filter((f) => f.remaining > 0).map((f) => ({ id: f.id, label: f.label, remaining: f.remaining }));
  const base = `/${locale}/parent/children/${childId}/scolarite`;

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

      <ChildTabs
        current={tab}
        tabs={[
          { key: 'current', label: data.activeYearLabel ?? t('finance.title'), href: base },
          {
            key: 'previous',
            label: previousCount > 0 ? `${t('finance.tabPrevious')} (${previousCount})` : t('finance.tabPrevious'),
            href: `${base}?tab=previous`,
          },
        ]}
      />

      <section className="rounded-2xl border border-slate-100 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-700">
            {tab === 'previous' ? t('finance.tabPrevious') : t('finance.title')}
          </h2>
          <span className="text-xs text-slate-500">
            {t('finance.paidOf', { paid: totalPaid.toLocaleString(locale), due: totalDue.toLocaleString(locale) })}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-600">
          <Legend className="bg-emerald-500" label={t('finance.legend.paid')} />
          <Legend className="bg-red-500" label={t('finance.legend.overdue')} />
          <Legend className="bg-amber-500" label={t('finance.legend.soon', { days: SOON_DAYS })} />
        </div>
        {shown.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500">
            {tab === 'previous' ? t('finance.emptyPrevious') : t('finance.empty')}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase text-slate-500">
                    <th className="px-2 py-2 text-start font-medium">{t('finance.label')}</th>
                    <th className="px-2 py-2 text-end font-medium">{t('finance.dueDate')}</th>
                    <th className="px-2 py-2 text-end font-medium">{t('finance.amount')}</th>
                    <th className="px-2 py-2 text-end font-medium">{t('finance.remaining')}</th>
                    <th className="px-2 py-2 text-center font-medium">{t('finance.status')}</th>
                    <th className="px-2 py-2 text-end font-medium">{t('finance.receipt')}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((f) => (
                    <tr key={f.id} className={`border-b border-white ${ROW_TONE[f.tone]}`}>
                      <td className="px-2 py-2 font-medium">{f.label}</td>
                      <td className="px-2 py-2 text-end tabular-nums">
                        {new Date(f.dueDate).toLocaleDateString(locale)}
                        {f.overdueDays > 0 && (
                          <span className="block text-[10px] font-semibold">{t('finance.overdue', { days: f.overdueDays })}</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-end tabular-nums">{f.amount.toLocaleString(locale)}</td>
                      <td className="px-2 py-2 text-end font-semibold tabular-nums">
                        {f.remaining > 0 ? f.remaining.toLocaleString(locale) : '—'}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${STATUS_TONE[f.status]}`}>
                          {t(`finance.statuses.${f.status}`)}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-end">
                        {f.status === 'PENDING' ? (
                          <span className="text-xs text-slate-300">—</span>
                        ) : (
                          <a href={`/api/admin/installments/${f.id}/receipt.pdf`} className="text-xs font-medium text-brand-700 hover:underline">
                            ⬇ {t('finance.receipt')}
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
              <span className="text-sm font-medium text-slate-700">{t('finance.totalRemaining')}</span>
              <span className={`text-lg font-semibold tabular-nums ${totalRemaining > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                {totalRemaining.toLocaleString(locale)} MAD
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

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${className}`} />
      {label}
    </span>
  );
}
