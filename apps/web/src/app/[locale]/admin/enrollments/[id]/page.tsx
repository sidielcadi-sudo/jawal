import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import {
  validateEnrollmentFormAction,
  withdrawEnrollmentFormAction,
} from '../form-actions';
import { readSiblingDiscountPct } from '@/lib/enrollment-discount';

export default async function EnrollmentDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = (await auth())!;
  const t = await getTranslations('admin.enrollments');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const enrollment = await tx.enrollment.findUnique({
      where: { id },
      include: {
        student: true,
        academicYear: true,
        level: true,
        class: true,
      },
    });
    if (!enrollment) return null;

    const compatibleClasses = await tx.class.findMany({
      where: {
        academicYearId: enrollment.academicYearId,
        levelId: enrollment.levelId,
        deletedAt: null,
      },
      include: { _count: { select: { students: { where: { unenrolledAt: null } } } } },
      orderBy: { name: 'asc' },
    });

    const fees = await tx.feeScheduleItem.findMany({
      where: { academicYearId: enrollment.academicYearId },
      select: { id: true },
    });
    const feeIds = fees.map((f) => f.id);
    const installments = await tx.installment.findMany({
      where: {
        studentId: enrollment.studentId,
        feeScheduleItemId: { in: feeIds },
      },
      include: { payments: true },
      orderBy: { dueDate: 'asc' },
    });

    const tenant = await tx.tenant.findFirstOrThrow();
    return { enrollment, compatibleClasses, installments, tenant };
  });

  if (!data) notFound();

  const { enrollment, compatibleClasses, installments, tenant } = data;
  const tenantPct = readSiblingDiscountPct(tenant.settings);

  const totalDue = installments.reduce(
    (s, i) => (i.status === 'CANCELLED' ? s : s + Number(i.amount)),
    0,
  );
  const totalPaid = installments.reduce(
    (s, i) => s + i.payments.reduce((ps, p) => ps + Number(p.amount), 0),
    0,
  );
  const cancelledCount = installments.filter((i) => i.status === 'CANCELLED').length;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <nav className="mb-3 text-xs text-slate-500">
        <Link href={`/${locale}/admin/enrollments`} className="hover:text-brand-700">
          {t('title')}
        </Link>
        <span className="mx-1.5">›</span>
        <span>
          {enrollment.student.lastName} {enrollment.student.firstName}
        </span>
      </nav>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {enrollment.student.lastName} {enrollment.student.firstName}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {enrollment.academicYear.label} · {enrollment.level.label}
            {enrollment.class && (
              <>
                {' · '}
                <Link
                  href={`/${locale}/admin/classes/${enrollment.class.id}`}
                  className="hover:text-brand-700"
                >
                  {enrollment.class.name}
                </Link>
              </>
            )}
          </p>
        </div>
        <StatusBadge status={enrollment.status} t={t} />
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-700">{t('detail.summary')}</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label={t('detail.enrolledAt')} value={new Date(enrollment.enrolledAt).toLocaleString(locale)} />
            {enrollment.validatedAt && (
              <Row label={t('detail.validatedAt')} value={new Date(enrollment.validatedAt).toLocaleString(locale)} />
            )}
            {enrollment.withdrawnAt && (
              <Row label={t('detail.withdrawnAt')} value={new Date(enrollment.withdrawnAt).toLocaleString(locale)} />
            )}
            <Row label={t('detail.siblingRank')} value={enrollment.siblingRank ? `#${enrollment.siblingRank}` : t('detail.notComputed')} />
            <Row
              label={t('detail.discount')}
              value={
                enrollment.discountPct !== null
                  ? `−${Number(enrollment.discountPct)}%`
                  : t('detail.noDiscount')
              }
            />
            {enrollment.discountReason && (
              <Row label={t('detail.discountReason')} value={enrollment.discountReason} />
            )}
            {enrollment.withdrawalReason && (
              <Row label={t('detail.withdrawalReason')} value={enrollment.withdrawalReason} />
            )}
            {enrollment.notes && (
              <Row label={t('detail.notes')} value={enrollment.notes} />
            )}
          </dl>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-700">{t('detail.fees')}</h2>
          {installments.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">{t('detail.feesEmpty')}</p>
          ) : (
            <>
              <dl className="mt-3 space-y-2 text-sm">
                <Row
                  label={t('detail.feesGenerated')}
                  value={enrollment.feesGenerated ? t('yes') : t('no')}
                />
                <Row
                  label={t('detail.totalDue')}
                  value={`${totalDue.toFixed(2)} ${tenant.currency}`}
                />
                <Row
                  label={t('detail.totalPaid')}
                  value={`${totalPaid.toFixed(2)} ${tenant.currency}`}
                  valueClass={totalPaid >= totalDue ? 'text-emerald-700' : ''}
                />
                <Row
                  label={t('detail.remaining')}
                  value={`${Math.max(0, totalDue - totalPaid).toFixed(2)} ${tenant.currency}`}
                  valueClass={totalDue - totalPaid > 0 ? 'text-amber-700' : 'text-emerald-700'}
                />
                <Row label={t('detail.cancelledCount')} value={String(cancelledCount)} />
              </dl>
              <Link
                href={`/${locale}/admin/finance?studentId=${enrollment.studentId}`}
                className="mt-3 inline-block text-xs font-medium text-brand-700 hover:underline"
              >
                {t('detail.viewFinance')} →
              </Link>
            </>
          )}
        </section>
      </div>

      {/* Actions selon le statut */}
      {(enrollment.status === 'DRAFT' || enrollment.status === 'ACTIVE') && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
          {enrollment.status === 'DRAFT' ? (
            <>
              <h2 className="text-sm font-semibold text-slate-700">{t('actions.validate')}</h2>
              <p className="mt-1 text-xs text-slate-500">
                {t('actions.validateHint', { pct: tenantPct })}
              </p>
              {compatibleClasses.length === 0 ? (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {t('actions.noCompatibleClass')}
                </div>
              ) : (
                <form action={validateEnrollmentFormAction} className="mt-3 space-y-3">
                  <input type="hidden" name="enrollmentId" value={enrollment.id} />
                  <Field label={t('actions.chooseClass')}>
                    <select
                      name="classId"
                      required
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="">{t('actions.chooseClassPlaceholder')}</option>
                      {compatibleClasses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c._count.students}/{c.capacity})
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label={t('actions.discountOverride')}>
                      <input
                        type="number"
                        name="discountPctOverride"
                        min={0}
                        max={100}
                        step="any"
                        placeholder={t('actions.discountAuto', { pct: tenantPct })}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </Field>
                    <Field label={t('actions.discountReason')}>
                      <input
                        type="text"
                        name="discountReason"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </Field>
                  </div>
                  <button
                    type="submit"
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                  >
                    ✓ {t('actions.validateBtn')}
                  </button>
                </form>
              )}
            </>
          ) : (
            <>
              <h2 className="text-sm font-semibold text-slate-700">{t('actions.withdraw')}</h2>
              <p className="mt-1 text-xs text-slate-500">{t('actions.withdrawHint')}</p>
              <form action={withdrawEnrollmentFormAction} className="mt-3 space-y-3">
                <input type="hidden" name="enrollmentId" value={enrollment.id} />
                <Field label={t('actions.withdrawReason')}>
                  <input
                    type="text"
                    name="reason"
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder={t('actions.withdrawReasonPlaceholder')}
                  />
                </Field>
                <button
                  type="submit"
                  className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                >
                  ✕ {t('actions.withdrawBtn')}
                </button>
              </form>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium uppercase text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Row({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-slate-100 py-1.5 last:border-0">
      <dt className="w-40 shrink-0 text-xs text-slate-500">{label}</dt>
      <dd className={`flex-1 text-sm ${valueClass ?? 'text-slate-900'}`}>{value}</dd>
    </div>
  );
}

function StatusBadge({
  status,
  t,
}: {
  status: 'DRAFT' | 'ACTIVE' | 'WITHDRAWN' | 'GRADUATED';
  t: (k: string) => string;
}) {
  const map = {
    DRAFT: 'bg-amber-100 text-amber-700',
    ACTIVE: 'bg-emerald-100 text-emerald-700',
    WITHDRAWN: 'bg-red-100 text-red-700',
    GRADUATED: 'bg-blue-100 text-blue-700',
  } as const;
  return (
    <span className={`rounded px-3 py-1 text-xs font-medium ${map[status]}`}>
      {t(`status.${status}`)}
    </span>
  );
}
