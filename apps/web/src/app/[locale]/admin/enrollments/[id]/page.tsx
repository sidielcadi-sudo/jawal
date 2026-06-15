import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { withdrawEnrollmentFormAction } from '../form-actions';
import { AdmissionPanel } from './admission-panel';
import { EcheancierTable } from './echeancier-table';

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

    // Grille du niveau (#4) : aperçu prévisionnel tant qu'aucune échéance générée.
    const feeGrid = await tx.feeScheduleItem.findMany({
      where: { academicYearId: enrollment.academicYearId, levelId: enrollment.levelId },
      orderBy: { label: 'asc' },
      select: { label: true, totalAmount: true, installmentCount: true },
    });

    // Catalogue de réductions actives (#5).
    const discountRules = await tx.discountRule.findMany({
      where: { active: true },
      orderBy: [{ order: 'asc' }, { label: 'asc' }],
      select: { id: true, label: true, pct: true },
    });
    const installments = await tx.installment.findMany({
      where: {
        studentId: enrollment.studentId,
        feeScheduleItemId: { in: feeIds },
      },
      include: { payments: true },
      orderBy: { dueDate: 'asc' },
    });

    const requiredDocs = await tx.requiredDocument.findMany({
      where: { active: true, OR: [{ levelId: null }, { levelId: enrollment.levelId }] },
      orderBy: [{ order: 'asc' }, { labelFr: 'asc' }],
      select: { id: true, labelFr: true, labelAr: true },
    });
    const enrollmentDocs = await tx.enrollmentDocument.findMany({
      where: { enrollmentId: id },
      include: { file: { select: { filename: true } } },
      orderBy: { createdAt: 'desc' },
    });

    // Créances antérieures non soldées (échéances impayées dues avant le début
    // de l'année du dossier) — à signaler à l'ouverture.
    const previousDue = await tx.installment.findMany({
      where: {
        studentId: enrollment.studentId,
        status: { in: ['PENDING', 'PARTIAL'] },
        dueDate: { lt: enrollment.academicYear.startDate },
      },
      include: { payments: true },
      orderBy: { dueDate: 'asc' },
    });

    const tenant = await tx.tenant.findFirstOrThrow();
    return {
      enrollment,
      compatibleClasses,
      installments,
      tenant,
      requiredDocs,
      enrollmentDocs,
      previousDue,
      feeGrid,
      discountRules,
    };
  });

  if (!data) notFound();

  const {
    enrollment,
    compatibleClasses,
    installments,
    tenant,
    requiredDocs,
    enrollmentDocs,
    previousDue,
    feeGrid,
    discountRules,
  } = data;

  const docByReq = new Map<string, (typeof enrollmentDocs)[number]>();
  for (const d of enrollmentDocs) {
    if (d.requiredDocumentId && !docByReq.has(d.requiredDocumentId)) docByReq.set(d.requiredDocumentId, d);
  }
  const installmentRows = installments.map((i) => {
    const firstPayment = i.payments[0];
    return {
      id: i.id,
      label: i.label,
      dueDate: i.dueDate.toISOString(),
      amount: Number(i.amount),
      status: i.status as 'PENDING' | 'PARTIAL' | 'PAID' | 'CANCELLED',
      method: firstPayment?.method ?? null,
      reference: firstPayment?.reference ?? null,
    };
  });
  const showEcheancier = ['ACCEPTE', 'INSCRIPTION_VALIDEE', 'AFFECTE', 'ACTIVE'].includes(
    enrollment.status,
  );
  const previousDueTotal = previousDue.reduce(
    (s, i) => s + Number(i.amount) - i.payments.reduce((ps, p) => ps + Number(p.amount), 0),
    0,
  );

  const docRows = requiredDocs.map((rd) => {
    const ed = docByReq.get(rd.id);
    return {
      requiredId: rd.id,
      label: locale === 'ar' ? rd.labelAr : rd.labelFr,
      doc: ed
        ? { id: ed.id, status: ed.status as 'PENDING' | 'VALID' | 'INVALID', filename: ed.file?.filename ?? '' }
        : null,
    };
  });
  // Pièces déposées hors liste requise (#8) : toujours listées en plus.
  const requiredIds = new Set(requiredDocs.map((rd) => rd.id));
  const otherDocs = enrollmentDocs
    .filter((d) => !d.requiredDocumentId || !requiredIds.has(d.requiredDocumentId))
    .map((d) => ({
      id: d.id,
      label: d.file?.filename ?? '',
      status: d.status as 'PENDING' | 'VALID' | 'INVALID',
    }));
  const classOptions = compatibleClasses.map((c) => ({
    id: c.id,
    name: c.name,
    capacity: c.capacity,
    count: c._count.students,
  }));

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
            feeGrid.length > 0 ? (
              <div className="mt-3">
                <p className="text-xs text-slate-500">{t('detail.feesPreviewHint')}</p>
                <dl className="mt-2 space-y-2 text-sm">
                  {feeGrid.map((f) => (
                    <Row
                      key={f.label}
                      label={f.label}
                      value={`${Number(f.totalAmount).toFixed(2)} ${tenant.currency} · ${f.installmentCount}× ${(
                        Number(f.totalAmount) / f.installmentCount
                      ).toFixed(2)}`}
                    />
                  ))}
                  <Row
                    label={t('detail.feesPreviewTotal')}
                    value={`${feeGrid
                      .reduce((s, f) => s + Number(f.totalAmount), 0)
                      .toFixed(2)} ${tenant.currency}`}
                  />
                </dl>
                <p className="mt-2 text-[11px] text-slate-400">{t('detail.feesPreviewNote')}</p>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">{t('detail.feesEmpty')}</p>
            )
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

      {/* Créance antérieure non soldée */}
      {previousDue.length > 0 && (
        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-900">
            ⚠ {t('detail.previousDueTitle')}
          </h2>
          <p className="mt-1 text-xs text-amber-800">
            {t('detail.previousDueHint', {
              amount: previousDueTotal.toFixed(2),
              currency: tenant.currency,
            })}
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {previousDue.map((i) => (
              <li
                key={i.id}
                className="rounded border border-amber-200 bg-white px-1.5 py-0.5 text-[11px] text-amber-800"
              >
                {i.label} · {new Date(i.dueDate).toLocaleDateString(locale)} ·{' '}
                {Number(i.amount).toFixed(0)} {tenant.currency}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Pipeline d'admission */}
      <AdmissionPanel
        enrollmentId={enrollment.id}
        status={enrollment.status}
        docs={docRows}
        classes={classOptions}
        discountRules={discountRules.map((d) => ({ id: d.id, label: d.label, pct: Number(d.pct) }))}
        otherDocs={otherDocs}
      />

      {/* Échéancier (encaissement par ligne) — dès l'acceptation */}
      {showEcheancier && <EcheancierTable rows={installmentRows} currency={tenant.currency} />}

      {/* Radiation d'un dossier actif (la validation passe par le Dossier d'admission) */}
      {enrollment.status === 'ACTIVE' && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
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

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  DOCUMENTS_MANQUANTS: 'bg-amber-100 text-amber-700',
  DOSSIER_COMPLET: 'bg-sky-100 text-sky-700',
  ACCEPTE: 'bg-indigo-100 text-indigo-700',
  REFUSE: 'bg-red-100 text-red-700',
  INSCRIPTION_VALIDEE: 'bg-teal-100 text-teal-700',
  AFFECTE: 'bg-violet-100 text-violet-700',
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  WITHDRAWN: 'bg-red-100 text-red-700',
  GRADUATED: 'bg-blue-100 text-blue-700',
};

function StatusBadge({ status, t }: { status: string; t: (k: string) => string }) {
  return (
    <span
      className={`rounded px-3 py-1 text-xs font-medium ${STATUS_BADGE[status] ?? 'bg-slate-100 text-slate-700'}`}
    >
      {t(`status.${status}`)}
    </span>
  );
}
