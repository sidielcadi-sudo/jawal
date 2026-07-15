import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { can, currentUserRoleCodes } from '@/lib/auth/rbac';
import { withTenant } from '@/lib/db';
import { withdrawEnrollmentFormAction } from '../form-actions';
import { applicableAnnualFees, type FeeCategory } from '@/lib/fees';
import { AdmissionPanel } from './admission-panel';
import { RadiationPanel } from './radiation-panel';
import { RefundPanel } from './refund-panel';
import { EcheancierTable } from './echeancier-table';
import { RegimeEdit } from './regime-edit';
import { SettleDebtsButton } from './settle-debts';

export default async function EnrollmentDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = (await auth())!;
  const t = await getTranslations('admin.enrollments');
  // Cloisonnement : la Vie scolaire (rôle cpe) n'accède pas au détail financier
  // de l'élève (échéancier, encaissements, créances). Réservé aux profils finance.
  const canSeeFinance = await can('finance.read');
  const roleCodes = await currentUserRoleCodes();

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
      select: { id: true, label: true, category: true },
    });
    const feeIds = fees.map((f) => f.id);
    const feeMetaById = new Map(fees.map((f) => [f.id, { label: f.label, category: f.category }]));

    // Frais annuels du (niveau × année) avec leurs réductions (rattachées ou globales).
    const annualFeesRaw = await tx.feeScheduleItem.findMany({
      where: {
        academicYearId: enrollment.academicYearId,
        levelId: enrollment.levelId,
        kind: 'ANNUAL',
      },
      orderBy: { label: 'asc' },
      include: {
        discountRules: {
          where: { active: true },
          orderBy: [{ order: 'asc' }, { label: 'asc' }],
          select: { id: true, label: true, pct: true },
        },
      },
    });
    // Réductions globales (feeScheduleItemId null) applicables à n'importe quel frais.
    const globalDiscounts = await tx.discountRule.findMany({
      where: { active: true, feeScheduleItemId: null },
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

    // Créances de la FAMILLE (tous les enfants des parents de l'élève) non soldées
    // et dues avant le début de l'année du dossier → à solder à l'inscription.
    const parentRels = await tx.personRelation.findMany({
      where: { childId: enrollment.studentId },
      select: { parentId: true },
    });
    let familyStudentIds = [enrollment.studentId];
    if (parentRels.length > 0) {
      const kids = await tx.personRelation.findMany({
        where: { parentId: { in: parentRels.map((r) => r.parentId) } },
        distinct: ['childId'],
        select: { childId: true },
      });
      familyStudentIds = [...new Set([enrollment.studentId, ...kids.map((k) => k.childId)])];
    }
    const previousDue = await tx.installment.findMany({
      where: {
        studentId: { in: familyStudentIds },
        status: { in: ['PENDING', 'PARTIAL'] },
        dueDate: { lt: enrollment.academicYear.startDate },
      },
      include: { payments: true, student: { select: { firstName: true, lastName: true } } },
      orderBy: { dueDate: 'asc' },
    });

    // Rang fratrie (affiché même avant acceptation) : nb de frères/sœurs déjà
    // inscrits cette année + 1. 1 = aîné.
    const childRels = await tx.personRelation.findMany({
      where: { childId: enrollment.studentId },
      select: { parentId: true },
    });
    let siblingRank = 1;
    if (childRels.length > 0) {
      const sibs = await tx.personRelation.findMany({
        where: {
          parentId: { in: childRels.map((r) => r.parentId) },
          childId: { not: enrollment.studentId },
        },
        distinct: ['childId'],
        select: { childId: true },
      });
      if (sibs.length > 0) {
        const enrolledSiblings = await tx.enrollment.count({
          where: {
            studentId: { in: sibs.map((s) => s.childId) },
            academicYearId: enrollment.academicYearId,
            status: { in: ['ACTIVE', 'AFFECTE', 'INSCRIPTION_VALIDEE', 'ACCEPTE'] },
          },
        });
        siblingRank = enrolledSiblings + 1;
      }
    }

    const tenant = await tx.tenant.findFirstOrThrow();
    return {
      enrollment,
      siblingRank,
      compatibleClasses,
      installments,
      tenant,
      requiredDocs,
      enrollmentDocs,
      previousDue,
      annualFeesRaw,
      globalDiscounts: globalDiscounts.map((d) => ({ id: d.id, label: d.label, pct: Number(d.pct) })),
      feeMeta: Array.from(feeMetaById.entries()),
    };
  });

  if (!data) notFound();

  const {
    enrollment,
    siblingRank,
    compatibleClasses,
    installments,
    tenant,
    requiredDocs,
    enrollmentDocs,
    previousDue,
    annualFeesRaw,
    globalDiscounts,
    feeMeta,
  } = data;
  const feeMetaById = new Map(feeMeta);

  // Dernière demande de radiation (+ remboursement) + tuteurs de l'élève.
  const { radiationRequest, radiationRefund, guardians } = await withTenant(session.user.tenantId, async (tx) => {
    const [radiationRequest, guardians] = await Promise.all([
      tx.radiationRequest.findFirst({
        where: { enrollmentId: enrollment.id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          type: true,
          status: true,
          reason: true,
          destinationSchool: true,
          debtCleared: true,
          noteRequested: true,
          vieScolaireComment: true,
          comptaComment: true,
          directionComment: true,
          rejectionReason: true,
        },
      }),
      tx.personRelation.findMany({
        where: { childId: enrollment.student.id },
        include: { parent: { select: { id: true, firstName: true, lastName: true, contacts: true } } },
      }),
    ]);
    const radiationRefund = radiationRequest
      ? await tx.radiationRefund.findUnique({ where: { radiationRequestId: radiationRequest.id } })
      : null;
    return { radiationRequest, radiationRefund, guardians };
  });

  // Frais annuels applicables à l'élève (selon transport / régime) → lignes du
  // Dossier d'admission + aperçu prévisionnel (#4 + table éditable).
  const feeCategoryLabels = await getTranslations('admin.settings.fees.form.categories');
  const tPForm = await getTranslations('admin.persons.form');
  const applicable = applicableAnnualFees(
    annualFeesRaw.map((f) => ({ ...f, category: f.category as FeeCategory })),
    { usesTransport: enrollment.student.usesTransport, regime: enrollment.student.regime },
  );
  const feeLines = applicable.map((f) => ({
    feeId: f.id,
    category: f.category as FeeCategory,
    categoryLabel: feeCategoryLabels(f.category),
    feeLabel: f.label,
    amount: Number(f.totalAmount),
    installmentCount: f.installmentCount,
    installmentLocked: f.installmentLocked,
    discounts: [
      ...f.discountRules.map((d) => ({ id: d.id, label: d.label, pct: Number(d.pct) })),
      ...globalDiscounts,
    ],
  }));

  const docByReq = new Map<string, (typeof enrollmentDocs)[number]>();
  for (const d of enrollmentDocs) {
    if (d.requiredDocumentId && !docByReq.has(d.requiredDocumentId)) docByReq.set(d.requiredDocumentId, d);
  }
  const installmentRows = installments.map((i) => {
    const firstPayment = i.payments[0];
    const paid = i.payments.reduce((s, p) => s + Number(p.amount), 0);
    return {
      id: i.id,
      label: i.label,
      // Libellé exact du frais (ex. « Frais d'inscription » vs « Scolarité »),
      // et non sa catégorie — sinon l'inscription s'affiche comme « Scolarité ».
      feeType: (() => {
        const meta = i.feeScheduleItemId ? feeMetaById.get(i.feeScheduleItemId) : null;
        return meta?.label || i.label;
      })(),
      dueDate: i.dueDate.toISOString(),
      amount: Number(i.amount),
      paid,
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

  // Frais éditables (re-répartition du nb d'échéances) : ceux déjà générés.
  // Verrouillés si une échéance est (partiellement) payée ou si le frais est figé.
  const instByFee = new Map<string, typeof installments>();
  for (const i of installments) {
    if (!i.feeScheduleItemId) continue;
    const arr = instByFee.get(i.feeScheduleItemId) ?? [];
    arr.push(i);
    instByFee.set(i.feeScheduleItemId, arr);
  }
  const editableFees = feeLines
    .map((f) => {
      const insts = (instByFee.get(f.feeId) ?? []).filter((i) => i.status !== 'CANCELLED');
      if (insts.length === 0) return null;
      const hasPaid = insts.some((i) => i.payments.reduce((s, p) => s + Number(p.amount), 0) > 0);
      return {
        feeId: f.feeId,
        label: `${f.categoryLabel} — ${f.feeLabel}`,
        currentCount: insts.length,
        locked: hasPaid || f.installmentLocked,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Dossier archivé (« Historique ») : consultable mais non modifiable.
  const archived = !!enrollment.archivedAt;

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

      <header className="-mx-6 overflow-hidden rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-3 mb-6 flex flex-wrap items-start justify-between gap-3">
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

      {archived && (
        <div className="mb-5 rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-slate-700">🗄 {t('detail.archivedTitle')}</p>
          <p className="mt-0.5 text-xs text-slate-500">{t('detail.archivedHint')}</p>
        </div>
      )}

      {/* Tuteurs / parents de l'élève à inscrire */}
      <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">{t('detail.guardians')}</h2>
        {guardians.length === 0 ? (
          <p className="text-xs text-slate-500">{t('detail.noGuardian')}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {guardians.map((g) => {
              const c = (g.parent.contacts ?? {}) as { phone?: string; email?: string; whatsapp?: string };
              return (
                <li key={g.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
                  <Link href={`/${locale}/admin/persons/${g.parent.id}`} className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-800 hover:text-brand-700">{g.parent.lastName} {g.parent.firstName}</span>
                    <span className="text-[11px] text-slate-500">{t(`detail.relations.${g.type}` as never)}</span>
                  </Link>
                  <span className="shrink-0 text-end text-xs text-slate-500">
                    {c.phone && <span className="block">{c.phone}</span>}
                    {c.email && <span className="block truncate text-[11px]">{c.email}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-700">{t('detail.summary')}</h2>
            {!archived && (
              <RegimeEdit
                enrollmentId={enrollment.id}
                regime={enrollment.student.regime}
                usesTransport={enrollment.student.usesTransport}
                fees={editableFees}
              />
            )}
          </div>
          <dl className="mt-3 space-y-2 text-sm">
            <Row
              label={tPForm('regime.label')}
              value={
                enrollment.student.regime
                  ? tPForm(`regime.${enrollment.student.regime}` as never)
                  : '—'
              }
            />
            <Row
              label={tPForm('usesTransport')}
              value={enrollment.student.usesTransport ? tPForm('usesTransportYes') : tPForm('usesTransportNo')}
            />
            <Row label={t('detail.enrolledAt')} value={new Date(enrollment.enrolledAt).toLocaleString(locale)} />
            {enrollment.validatedAt && (
              <Row label={t('detail.validatedAt')} value={new Date(enrollment.validatedAt).toLocaleString(locale)} />
            )}
            {enrollment.withdrawnAt && (
              <Row label={t('detail.withdrawnAt')} value={new Date(enrollment.withdrawnAt).toLocaleString(locale)} />
            )}
            <Row
              label={t('detail.siblingRank')}
              value={`#${enrollment.siblingRank ?? siblingRank}`}
            />
            {enrollment.discountPct !== null && (
              <Row label={t('detail.discount')} value={`−${Number(enrollment.discountPct)}%`} />
            )}
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

        {canSeeFinance && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-700">{t('detail.fees')}</h2>
          {installments.length === 0 ? (
            feeLines.length > 0 ? (
              <div className="mt-3">
                <p className="text-xs text-slate-500">{t('detail.feesPreviewHint')}</p>
                <dl className="mt-2 space-y-2 text-sm">
                  {feeLines.map((f) => (
                    <Row
                      key={f.feeId}
                      label={`${f.categoryLabel} — ${f.feeLabel}`}
                      value={`${f.amount.toFixed(2)} ${tenant.currency} · ${f.installmentCount}× ${(
                        f.amount / f.installmentCount
                      ).toFixed(2)}`}
                    />
                  ))}
                  <Row
                    label={t('detail.feesPreviewTotal')}
                    value={`${feeLines
                      .reduce((s, f) => s + f.amount, 0)
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
        )}
      </div>

      {/* Créance antérieure non soldée */}
      {canSeeFinance && previousDue.length > 0 && (
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
                <strong>{i.student.lastName} {i.student.firstName}</strong> · {i.label} ·{' '}
                {new Date(i.dueDate).toLocaleDateString(locale)} · {Number(i.amount).toFixed(0)}{' '}
                {tenant.currency}
              </li>
            ))}
          </ul>
          <SettleDebtsButton
            installmentIds={previousDue
              .filter((i) => Number(i.amount) - i.payments.reduce((s, p) => s + Number(p.amount), 0) > 0)
              .map((i) => i.id)}
            total={previousDueTotal}
            currency={tenant.currency}
          />
        </section>
      )}

      {/* Pipeline d'admission — masqué sur un dossier archivé */}
      {!archived && (
        <AdmissionPanel
          enrollmentId={enrollment.id}
          status={enrollment.status}
          docs={docRows}
          classes={classOptions}
          feeLines={feeLines}
          currency={tenant.currency}
          otherDocs={otherDocs}
        />
      )}

      {/* Échéancier (encaissement par ligne) — dès l'acceptation, profils finance uniquement */}
      {canSeeFinance && showEcheancier && !archived && (
        <EcheancierTable rows={installmentRows} currency={tenant.currency} />
      )}

      {/* Radiation / transfert — uniquement pour un élève inscrit et actif.
          Le statut reste ACTIVE pendant tout le workflow (Vie scolaire → Compta →
          Direction) et ne passe à WITHDRAWN qu'à l'exécution finale. */}
      {enrollment.status === 'ACTIVE' && (
        <RadiationPanel
          enrollmentId={enrollment.id}
          request={radiationRequest}
          roleCodes={roleCodes}
          studentId={enrollment.studentId}
          academicYearId={enrollment.academicYearId}
        />
      )}

      {/* Remboursement (départ en cours d'année) — profils finance uniquement */}
      {canSeeFinance && radiationRefund && radiationRequest && (
        <RefundPanel
          radiationId={radiationRequest.id}
          roleCodes={roleCodes}
          currency={tenant.currency}
          refund={{
            status: radiationRefund.status,
            basis: radiationRefund.basis,
            paidTotal: Number(radiationRefund.paidTotal),
            consumedTotal: Number(radiationRefund.consumedTotal),
            computedAmount: Number(radiationRefund.computedAmount),
            approvedAmount: radiationRefund.approvedAmount === null ? null : Number(radiationRefund.approvedAmount),
            method: radiationRefund.method,
            reference: radiationRefund.reference,
            directionComment: radiationRefund.directionComment,
            breakdown: radiationRefund.breakdown as
              | { category: string; paid: number; consumed: number; refundable: number }[]
              | null,
            paidAt: radiationRefund.paidAt ? radiationRefund.paidAt.toISOString() : null,
          }}
        />
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
