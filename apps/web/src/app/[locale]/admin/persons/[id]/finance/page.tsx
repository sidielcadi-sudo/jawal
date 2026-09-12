import { Fragment } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { computeStudentFinance } from '@/lib/finance';
import { loadWaiveContext } from '@/lib/school-year';
import { GenerateForm, RecordPaymentButton, WaiveDebtButton } from './client';
import { personDisplayName, localizedLabel } from '@/lib/localized-name';

export default async function StudentFinancePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.studentFinance');
  const tPersons = await getTranslations('admin.persons');
  const tForm = await getTranslations('admin.persons.form');
  const tDetail = await getTranslations('admin.persons.detail');
  // Libellés des moyens de paiement (partagés avec la répartition Finances).
  const tMethod = await getTranslations('admin.finance.methods');

  const session = (await auth())!;
  const tenantId = session.user.tenantId;

  const data = await withTenant(tenantId, async (tx) => {
    const student = await tx.person.findUnique({ where: { id } });
    if (!student || student.type !== 'STUDENT') return null;

    // Classe de l'élève sur l'ANNÉE ACTIVE.
    //
    // Un élève garde une ligne de classe par année scolaire : sans ce tri, un
    // findFirst rendait celle que la base sortait en premier — souvent l'année
    // précédente. L'en-tête annonçait alors « 1AC-D · 2025-2026 » sur un élève
    // passé en 2AC-E, et les grilles tarifaires proposées étaient celles du
    // mauvais niveau. On retient l'année active, à défaut la plus récente.
    const enrollment =
      (await tx.studentClass.findFirst({
        where: { studentId: id, unenrolledAt: null, class: { academicYear: { active: true } } },
        include: { class: { include: { level: true, academicYear: true } } },
      })) ??
      (await tx.studentClass.findFirst({
        where: { studentId: id, unenrolledAt: null },
        orderBy: { class: { academicYear: { startDate: 'desc' } } },
        include: { class: { include: { level: true, academicYear: true } } },
      }));

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
    // Bornes de chaque année, pour ranger les échéances par exercice : la fiche
    // les empilait toutes, et « Scolarité (1/3) » de 2025-2026 juste au-dessus
    // de « Scolarité (1/9) » de 2026-2027 se lit comme un doublon.
    const years = await tx.academicYear.findMany({
      select: { id: true, label: true, startDate: true, endDate: true, active: true },
      orderBy: { startDate: 'asc' },
    });
    const tenant = await tx.tenant.findFirst();
    // L'effacement de créance (remise gracieuse) suit la politique de
    // l'établissement — cf. lib/school-year, réglable dans Paramétrage → Frais.
    const waive = await loadWaiveContext(tx);
    return {
      student,
      enrollment,
      fees,
      finance,
      years,
      currency: tenant?.currency ?? 'MAD',
      canWaive: waive.canWaive,
      canWaivePrevious: waive.canWaivePrevious,
      yearStart: waive.yearStart,
      waiveOpensAt: waive.opensAt,
      activeYearLabel: waive.yearLabel,
    };
  });

  if (!data) notFound();
  const {
    student,
    enrollment,
    fees,
    finance,
    years,
    currency,
    canWaive,
    canWaivePrevious,
    yearStart,
    waiveOpensAt,
    activeYearLabel,
  } = data;

  /**
   * Effacement autorisé pour cette échéance. La fenêtre de fin d'année ne
   * protège que l'exercice en cours : une créance antérieure reste effaçable.
   */
  const canWaiveLine = (dueDate: string | Date) =>
    yearStart && new Date(dueDate).getTime() < yearStart.getTime() ? canWaivePrevious : canWaive;

  /** Année scolaire d'une échéance, d'après sa date. */
  const yearLabelOf = (dueDate: string | Date) => {
    const d = new Date(dueDate);
    return years.find((y) => d >= y.startDate && d <= y.endDate)?.label ?? '—';
  };

  const activeYear = years.find((y) => y.active) ?? null;

  /** Une échéance appartient-elle à l'exercice en cours ? */
  const isCurrentYear = (dueDate: string | Date) => {
    if (!activeYear) return true;
    const d = new Date(dueDate);
    return d >= activeYear.startDate && d <= activeYear.endDate;
  };

  /**
   * Les trois indicateurs portent sur l'ANNÉE ACTIVE seulement.
   *
   * Ils cumulaient tous les exercices : un « reste dû » de 9 000 MAD pouvait
   * n'être que l'arriéré d'une année close, et la fiche donnait à croire que
   * la famille était en retard sur l'année en cours. Les créances antérieures
   * restent visibles dans le tableau, sous leur propre bandeau, et se traitent
   * dans Finances → Gestion des impayés.
   */
  const today = new Date();
  const current = finance.installments.filter((i) => isCurrentYear(i.dueDate));
  const yearTotals = {
    due: current.reduce((s, i) => s + i.amount, 0),
    paid: current.reduce((s, i) => s + i.totalPaid, 0),
    remaining: current.reduce((s, i) => s + i.remaining, 0),
    overdue: current
      .filter((i) => i.remaining > 0 && new Date(i.dueDate) < today)
      .reduce((s, i) => s + i.remaining, 0),
  };
  /** Arriéré des exercices clos — dit à part, jamais mélangé à l'année. */
  const previousRemaining = finance.installments
    .filter((i) => !isCurrentYear(i.dueDate))
    .reduce((s, i) => s + i.remaining, 0);

  /**
   * Échéances groupées par exercice, le plus récent en tête : c'est l'année en
   * cours qu'on consulte, l'historique vient après.
   */
  const byYear = (() => {
    const map = new Map<string, typeof finance.installments>();
    for (const i of finance.installments) {
      const k = yearLabelOf(i.dueDate);
      const arr = map.get(k) ?? [];
      arr.push(i);
      map.set(k, arr);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  })();

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <nav className="mb-4 text-xs text-slate-500">
        <Link href={`/${locale}/admin/persons?type=STUDENT`} className="hover:text-brand-700">
          {tPersons('title.STUDENT')}
        </Link>
        <span className="mx-1.5">›</span>
        <Link href={`/${locale}/admin/persons/${id}`} className="hover:text-brand-700">
          {personDisplayName(locale, student)}
        </Link>
        <span className="mx-1.5">›</span>
        <span>{t('title')}</span>
      </nav>

      <header className="mb-6 overflow-hidden -mx-6 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-3">
        <h1 className="text-2xl font-semibold text-slate-900">
          {t('title')} — {personDisplayName(locale, student)}
        </h1>
        {enrollment && (
          <p className="mt-1 text-sm text-slate-500">
            {localizedLabel(locale, enrollment.class.name, enrollment.class.nameAr)} · {localizedLabel(locale, enrollment.class.level.label, enrollment.class.level.labelAr)} · {enrollment.class.academicYear.label}
          </p>
        )}
        {/* Même ligne d'identité que sur la fiche élève, pour reconnaître le
            dossier sans remonter à la fiche. */}
        <p className="mt-0.5 text-sm text-slate-500">
          {tForm('types.STUDENT')}
          {student.birthDate &&
            ` · ${tDetail('bornOn', { date: new Date(student.birthDate).toLocaleDateString(locale) })}`}
        </p>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <Kpi
          label={t('kpi.totalDue')}
          value={`${yearTotals.due.toFixed(2)} ${currency}`}
          color="slate"
          hint={activeYearLabel ?? undefined}
        />
        <Kpi
          label={t('kpi.totalPaid')}
          value={`${yearTotals.paid.toFixed(2)} ${currency}`}
          color="emerald"
          hint={activeYearLabel ?? undefined}
        />
        <Kpi
          label={t('kpi.totalRemaining')}
          value={`${yearTotals.remaining.toFixed(2)} ${currency}`}
          color={yearTotals.remaining > 0 ? 'red' : 'emerald'}
          hint={
            yearTotals.overdue > 0
              ? t('kpi.overdueHint', { amount: `${yearTotals.overdue.toFixed(2)} ${currency}` })
              : (activeYearLabel ?? undefined)
          }
        />
      </div>

      {/* L'arriéré des exercices clos n'entre pas dans les trois cartes : il se
          dit ici, pour qu'on sache qu'il existe sans le confondre avec la
          situation de l'année. */}
      {previousRemaining > 0.01 && (
        <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          {t('previousYearsDue', { amount: `${previousRemaining.toFixed(2)} ${currency}` })}
        </p>
      )}

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
        <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
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
              {byYear.map(([yearLabel, items]) => (
                <Fragment key={yearLabel}>
                  {/* Bandeau d exercice : sans lui, deux séries d échéances de
                      deux années se suivent et passent pour un doublon. */}
                  {/* Couleur distincte pour un exercice clos : sur une fiche
                      qui empile deux années, la seule taille du libellé ne
                      suffit pas à voir qu'on a changé de périmètre. */}
                  <tr className={yearLabel === activeYearLabel ? 'title-band' : 'bg-amber-100'}>
                    <td
                      colSpan={7}
                      className={`px-4 py-1.5 text-xs font-semibold uppercase tracking-wide ${
                        yearLabel === activeYearLabel ? 'text-slate-700' : 'text-amber-900'
                      }`}
                    >
                      {yearLabel}
                      <span className="ms-2 font-normal normal-case opacity-70">
                        {t('yearCount', { count: items.length })}
                        {yearLabel !== activeYearLabel ? ` · ${t('previousYear')}` : ''}
                      </span>
                    </td>
                  </tr>
                  {items.map((i) => (
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
                      <span className="inline-flex items-center">
                        <RecordPaymentButton
                          installmentId={i.id}
                          remaining={i.remaining}
                          currency={currency}
                        />
                        {/* Effacement de créance : uniquement sur un reliquat
                            non soldé, et — pour l'année en cours — uniquement
                            en fin d'année scolaire. */}
                        {i.remaining > 0 && canWaiveLine(i.dueDate) && (
                          <WaiveDebtButton
                            installmentId={i.id}
                            remaining={i.remaining}
                            currency={currency}
                          />
                        )}
                      </span>
                    )}
                    {/* Données du paiement (moyen · référence · date), comme dans
                        l'échéancier du dossier d'inscription. */}
                    {i.payments.length > 0 && (
                      <div className="mt-1 space-y-0.5 text-[11px] leading-tight text-slate-500">
                        {i.payments.map((p) => (
                          <div key={p.id}>
                            <span className="font-medium text-emerald-700">
                              {tMethod(p.method as never)}
                            </span>
                            {p.reference && <span> · {p.reference}</span>}
                            <span> · {new Date(p.paidAt).toLocaleDateString(locale)}</span>
                            <span className="tabular-nums"> · {p.amount.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {i.payments.length === 0 && (i.status === 'PAID' || i.status === 'CANCELLED') && (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
                  ))}
                </Fragment>
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
        {/* Le bouton « Effacer » manque à l'appel une bonne partie de l'année :
            on dit pourquoi, sinon l'agent croit à un bug de droits. */}
        {!canWaive && finance.installments.some((i) => i.remaining > 0 && !canWaiveLine(i.dueDate)) && (
          <p className="mt-2 text-xs text-slate-500">
            {waiveOpensAt && activeYearLabel
              ? t('waive.closedHint', {
                  date: waiveOpensAt.toLocaleDateString(locale),
                  year: activeYearLabel,
                })
              : t('waive.noActiveYear')}
          </p>
        )}
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  color,
  hint,
}: {
  label: string;
  value: string;
  color: 'slate' | 'emerald' | 'red';
  hint?: string;
}) {
  const colors: Record<string, string> = {
    slate: 'text-slate-900',
    emerald: 'text-emerald-700',
    red: 'text-red-700',
  };
  return (
    <div className="rounded-2xl border border-brand-200 bg-white p-5">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl font-semibold tabular-nums ${colors[color]}`}>{value}</div>
      {hint && <div className="mt-1 text-xs font-medium text-amber-700">{hint}</div>}
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
