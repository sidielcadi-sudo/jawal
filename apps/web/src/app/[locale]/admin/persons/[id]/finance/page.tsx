import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { computeStudentFinance } from '@/lib/finance';
import { GenerateForm, RecordPaymentButton } from './client';

export default async function StudentFinancePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.studentFinance');

  const session = (await auth())!;
  const tenantId = session.user.tenantId;

  const data = await withTenant(tenantId, async (tx) => {
    const student = await tx.person.findUnique({ where: { id } });
    if (!student || student.type !== 'STUDENT') return null;

    // Trouver la classe active de l'élève (1ère inscription active)
    const enrollment = await tx.studentClass.findFirst({
      where: { studentId: id, unenrolledAt: null },
      include: {
        class: { include: { level: true, academicYear: true } },
      },
    });

    // Grilles tarifaires disponibles (pour générer un échéancier)
    const fees = enrollment
      ? await tx.feeScheduleItem.findMany({
          where: {
            academicYearId: enrollment.class.academicYearId,
            levelId: enrollment.class.levelId,
          },
        })
      : [];

    const finance = await computeStudentFinance(tx, id);
    const tenant = await tx.tenant.findFirst();
    return { student, enrollment, fees, finance, currency: tenant?.currency ?? 'MAD' };
  });

  if (!data) notFound();
  const { student, enrollment, fees, finance, currency } = data;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <nav className="mb-4 text-xs text-slate-500">
        <Link href={`/${locale}/admin/persons`} className="hover:text-brand-700">
          {t('persons')}
        </Link>
        <span className="mx-1.5">›</span>
        <Link href={`/${locale}/admin/persons/${id}`} className="hover:text-brand-700">
          {student.lastName} {student.firstName}
        </Link>
        <span className="mx-1.5">›</span>
        <span>{t('title')}</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">
          {t('title')} — {student.lastName} {student.firstName}
        </h1>
        {enrollment && (
          <p className="mt-1 text-sm text-slate-500">
            {enrollment.class.name} · {enrollment.class.level.label} · {enrollment.class.academicYear.label}
          </p>
        )}
      </header>

      <div className="grid grid-cols-3 gap-3">
        <Kpi label={t('kpi.totalDue')} value={`${finance.totalDue.toFixed(2)} ${currency}`} color="slate" />
        <Kpi label={t('kpi.totalPaid')} value={`${finance.totalPaid.toFixed(2)} ${currency}`} color="emerald" />
        <Kpi
          label={t('kpi.totalRemaining')}
          value={`${finance.totalRemaining.toFixed(2)} ${currency}`}
          color={finance.totalRemaining > 0 ? 'red' : 'emerald'}
        />
      </div>

      <section className="mt-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">{t('installments')}</h2>
          {fees.length > 0 && finance.installments.length === 0 && (
            <GenerateForm
              studentId={id}
              fees={fees.map((f) => ({
                id: f.id,
                label: `${f.label} (${Number(f.totalAmount).toFixed(2)} ${currency} / ${f.installmentCount}×)`,
              }))}
            />
          )}
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-start">{t('table.label')}</th>
                <th className="px-4 py-3 text-start">{t('table.dueDate')}</th>
                <th className="px-4 py-3 text-end">{t('table.amount')}</th>
                <th className="px-4 py-3 text-end">{t('table.paid')}</th>
                <th className="px-4 py-3 text-end">{t('table.remaining')}</th>
                <th className="px-4 py-3 text-start">{t('table.status')}</th>
                <th className="px-4 py-3 text-end">{t('table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {finance.installments.map((i) => (
                <tr key={i.id}>
                  <td className="px-4 py-3">{i.label}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {new Date(i.dueDate).toLocaleDateString(locale)}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">{i.amount.toFixed(2)}</td>
                  <td className="px-4 py-3 text-end tabular-nums text-emerald-700">
                    {i.totalPaid.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums text-red-700">
                    {i.remaining.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <StatusBadge status={i.status} label={t(`status.${i.status}` as never)} />
                  </td>
                  <td className="px-4 py-3 text-end">
                    {i.status !== 'PAID' && i.status !== 'CANCELLED' && (
                      <RecordPaymentButton
                        installmentId={i.id}
                        remaining={i.remaining}
                        currency={currency}
                      />
                    )}
                  </td>
                </tr>
              ))}
              {finance.installments.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    {fees.length > 0
                      ? t('emptyHint')
                      : t('noFees')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: 'slate' | 'emerald' | 'red';
}) {
  const colors: Record<string, string> = {
    slate: 'text-slate-900',
    emerald: 'text-emerald-700',
    red: 'text-red-700',
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl font-semibold tabular-nums ${colors[color]}`}>{value}</div>
    </div>
  );
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const styles: Record<string, string> = {
    PENDING: 'bg-amber-100 text-amber-800',
    PARTIAL: 'bg-blue-100 text-blue-800',
    PAID: 'bg-emerald-100 text-emerald-800',
    CANCELLED: 'bg-slate-200 text-slate-700',
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${styles[status]}`}>{label}</span>
  );
}
