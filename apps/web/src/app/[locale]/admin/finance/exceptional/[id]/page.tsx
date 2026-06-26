import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { PublishButton, PayButton, CancelButton } from './detail-client';

const CONSENT_TONE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  ACCEPTED: 'bg-emerald-100 text-emerald-700',
  REFUSED: 'bg-red-100 text-red-700',
};

export default async function ExceptionalFeeDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.exceptionalFees');
  const session = (await auth())!;

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const fee = await tx.exceptionalFee.findUnique({
      where: { id },
      include: { type: { select: { labelFr: true } }, academicYear: { select: { label: true } } },
    });
    if (!fee) return null;

    const [assignments, classRows, tenant] = await Promise.all([
      tx.exceptionalFeeAssignment.findMany({
        where: { exceptionalFeeId: id },
        include: {
          student: { select: { id: true, firstName: true, lastName: true } },
          installment: { include: { payments: { select: { id: true, amount: true } } } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      tx.class.findMany({
        where: { academicYear: { active: true } },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          students: {
            where: { unenrolledAt: null },
            select: { student: { select: { id: true, firstName: true, lastName: true } } },
          },
        },
      }),
      tx.tenant.findFirst({ select: { currency: true } }),
    ]);

    // Map élève → classe (pour la colonne classe du suivi).
    const studentClass = new Map<string, string>();
    for (const c of classRows) {
      for (const sc of c.students) studentClass.set(sc.student.id, c.name);
    }

    // Échéances ouvertes des élèves concernés → cibles d'imputation (avoir).
    const studentIds = [...new Set(assignments.map((a) => a.studentId))];
    const exInstIds = new Set(
      assignments.map((a) => a.installment?.id).filter((x): x is string => Boolean(x)),
    );
    const openInst = studentIds.length
      ? await tx.installment.findMany({
          where: { studentId: { in: studentIds }, status: { in: ['PENDING', 'PARTIAL'] } },
          include: { payments: { select: { amount: true } } },
          orderBy: { dueDate: 'asc' },
        })
      : [];
    const creditTargets = new Map<string, { id: string; label: string; remaining: number }[]>();
    for (const i of openInst) {
      if (exInstIds.has(i.id)) continue;
      const p = i.payments.reduce((s, x) => s + Number(x.amount), 0);
      const remaining = Math.max(0, Number(i.amount) - p);
      if (remaining <= 0) continue;
      const arr = creditTargets.get(i.studentId) ?? [];
      arr.push({ id: i.id, label: i.label, remaining });
      creditTargets.set(i.studentId, arr);
    }

    return {
      fee: {
        id: fee.id,
        label: fee.label,
        description: fee.description,
        amount: Number(fee.amount),
        mandatory: fee.mandatory,
        status: fee.status,
        typeLabel: fee.type?.labelFr ?? null,
        yearLabel: fee.academicYear.label,
        activityDate: fee.activityDate,
        dueDate: fee.dueDate,
      },
      rows: assignments.map((a) => {
        const inst = a.installment;
        const paid = inst ? inst.payments.reduce((s, p) => s + Number(p.amount), 0) : 0;
        const amount = inst ? Number(inst.amount) : Number(fee.amount);
        return {
          assignmentId: a.id,
          studentName: `${a.student.lastName} ${a.student.firstName}`,
          className: studentClass.get(a.student.id) ?? '—',
          consent: a.consent,
          installmentId: inst?.id ?? null,
          instStatus: inst?.status ?? null,
          amount,
          paid,
          remaining: Math.max(0, amount - paid),
          hasPayment: paid > 0,
          refundMode: a.refundMode as 'REFUNDED' | 'CREDITED' | null,
          creditTargets: creditTargets.get(a.student.id) ?? [],
        };
      }),
      currency: tenant?.currency ?? 'MAD',
    };
  });

  if (!data) notFound();
  const { fee, rows, currency } = data;
  const base = `/${locale}/admin/finance/exceptional`;

  return (
    <div className="px-3 py-3">
      <header className="mb-4 overflow-hidden rounded-3xl bg-gradient-to-r from-[#e8edff] to-[#eef0ff] px-4 py-2.5">
        <Link href={base} className="text-xs text-brand-700 hover:underline">← {t('backToList')}</Link>
        <h1 className="mt-1 text-base font-bold text-slate-900">{fee.label}</h1>
        <p className="mt-0.5 text-sm text-slate-600">
          {fee.amount.toLocaleString(locale)} {currency}
          {' · '}{fee.mandatory ? t('mandatoryBadge') : t('optionalBadge')}
          {fee.typeLabel ? ` · ${fee.typeLabel}` : ''}
          {' · '}{fee.yearLabel}
          {fee.activityDate ? ` · ${t('form.activityDate')}: ${new Date(fee.activityDate).toLocaleDateString(locale)}` : ''}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-start">{t('suivi.student')}</th>
                  <th className="px-4 py-3 text-start">{t('suivi.class')}</th>
                  <th className="px-4 py-3 text-center">{t('suivi.consent')}</th>
                  <th className="px-4 py-3 text-center">{t('suivi.payment')}</th>
                  <th className="px-4 py-3 text-end">{t('suivi.receipt')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.assignmentId}>
                    <td className="px-4 py-3 font-medium text-slate-800">{r.studentName}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{r.className}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${CONSENT_TONE[r.consent]}`}>
                        {t(`consents.${r.consent}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.consent === 'REFUSED' ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : !r.installmentId ? (
                        <span className="text-xs text-slate-400">{t('suivi.notBilled')}</span>
                      ) : r.instStatus === 'CANCELLED' ? (
                        <span className="text-xs font-medium text-slate-500">
                          {t('suivi.cancelled')}
                          {r.refundMode === 'REFUNDED' ? ` · ${t('suivi.refunded')}` : ''}
                          {r.refundMode === 'CREDITED' ? ` · ${t('suivi.credited')}` : ''}
                        </span>
                      ) : (
                        <span className="flex flex-col items-center gap-1.5">
                          {r.instStatus === 'PAID' ? (
                            <span className="text-xs font-medium text-emerald-700">{t('suivi.paid')}</span>
                          ) : (
                            <>
                              <span className="text-[11px] text-amber-700">
                                {t('suivi.remaining')}: {r.remaining.toLocaleString(locale)} {currency}
                              </span>
                              <PayButton installmentId={r.installmentId} remaining={r.remaining} currency={currency} />
                            </>
                          )}
                          <CancelButton
                            assignmentId={r.assignmentId}
                            paid={r.paid}
                            currency={currency}
                            creditTargets={r.creditTargets}
                          />
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-end">
                      {r.hasPayment && r.installmentId ? (
                        <a
                          href={`/api/admin/installments/${r.installmentId}/receipt.pdf`}
                          className="text-xs font-medium text-brand-700 hover:underline"
                        >
                          ⬇ PDF
                        </a>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-slate-500">{t('suivi.empty')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside>
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">{t('assign.title')}</h2>
            <p className="mt-1 text-xs text-slate-500">{t('assign.subtitle')}</p>
            <div className="mt-4">
              <PublishButton feeId={fee.id} status={fee.status} mandatory={fee.mandatory} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
