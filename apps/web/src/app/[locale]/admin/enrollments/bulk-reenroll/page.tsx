import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { proposeNextLevel } from '@/lib/level-progression';
import { BulkReenrollSheet, type Row, type YearOpt, type LevelOpt } from './sheet';
import { localizedLabel } from '@/lib/localized-name';

export default async function BulkReenrollPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ source?: string; target?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const session = (await auth())!;
  const t = await getTranslations('admin.enrollments.bulk');

  const { years, levels, sourceYearId, targetYearId, rows, currency } = await withTenant(
    session.user.tenantId,
    async (tx) => {
      const years = await tx.academicYear.findMany({
        orderBy: { startDate: 'desc' },
        select: { id: true, label: true, active: true, startDate: true },
      });
      const active = years.find((y) => y.active);
      const sourceYearId = sp.source ?? active?.id ?? years[0]?.id ?? null;
      // Cible par défaut : année immédiatement plus récente (vers le futur)
      const targetCandidate = sourceYearId
        ? years
            .filter(
              (y) =>
                y.id !== sourceYearId &&
                y.startDate.getTime() >
                  (years.find((s) => s.id === sourceYearId)?.startDate.getTime() ?? 0),
            )
            .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())[0]
        : null;
      const targetYearId = sp.target ?? targetCandidate?.id ?? null;

      const levelsRaw = await tx.level.findMany({
        include: { cycle: { select: { id: true, order: true, label: true, labelAr: true } } },
        orderBy: [{ cycle: { order: 'asc' } }, { order: 'asc' }],
      });
      const levels: LevelOpt[] = levelsRaw.map((l) => ({
        id: l.id,
        label: localizedLabel(locale, l.label, l.labelAr),
        cycleId: l.cycleId,
        cycleLabel: localizedLabel(locale, l.cycle.label, l.cycle.labelAr),
        order: l.order,
        cycle: { id: l.cycle.id, order: l.cycle.order },
      }));

      let rows: Row[] = [];
      if (sourceYearId) {
        const sourceEnrollments = await tx.enrollment.findMany({
          where: {
            academicYearId: sourceYearId,
            status: { in: ['ACTIVE', 'DRAFT'] },
          },
          include: {
            student: { select: { id: true, firstName: true, lastName: true, firstNameAr: true, lastNameAr: true } },
            level: { select: { label: true, labelAr: true, cycleId: true } },
            class: { select: { name: true, nameAr: true } },
          },
          orderBy: [{ status: 'asc' }, { student: { lastName: 'asc' } }],
        });

        // Pour chaque source : si un dossier existe déjà sur targetYear, on
        // l'indique pour griser la ligne.
        const studentIds = sourceEnrollments.map((e) => e.studentId);
        const targetExisting = targetYearId
          ? await tx.enrollment.findMany({
              where: {
                academicYearId: targetYearId,
                studentId: { in: studentIds },
              },
              select: { studentId: true, status: true },
            })
          : [];
        const existingByStudent = new Map(targetExisting.map((e) => [e.studentId, e.status]));

        // Solde restant dû par élève : total des échéances non soldées, tous
        // exercices confondus. On le montre avant la décision : réinscrire un
        // élève dont la famille traîne un impayé n'est pas un geste anodin.
        const installments = await tx.installment.findMany({
          where: { studentId: { in: studentIds } },
          select: { studentId: true, amount: true, payments: { select: { amount: true } } },
        });
        const balanceByStudent = new Map<string, number>();
        for (const i of installments) {
          const paid = i.payments.reduce((s, p) => s + Number(p.amount), 0);
          const remaining = Math.max(0, Number(i.amount) - paid);
          balanceByStudent.set(i.studentId, (balanceByStudent.get(i.studentId) ?? 0) + remaining);
        }

        rows = sourceEnrollments.map((e) => {
          const suggested = proposeNextLevel(e.levelId, levels);
          const suggestedFull = suggested ? levels.find((l) => l.id === suggested.id) : null;
          return {
            sourceEnrollmentId: e.id,
            studentId: e.studentId,
            firstName: e.student.firstName,
            lastName: e.student.lastName,
            firstNameAr: e.student.firstNameAr,
            lastNameAr: e.student.lastNameAr,
            currentLevelId: e.levelId,
            currentLevelLabel: localizedLabel(locale, e.level.label, e.level.labelAr),
            currentClassName: e.class ? localizedLabel(locale, e.class.name, e.class.nameAr) : null,
            currentStatus: e.status as 'ACTIVE' | 'DRAFT',
            suggestedNextLevelId: suggested?.id ?? null,
            suggestedNextLevelLabel: suggestedFull?.label ?? null,
            balance: Math.round((balanceByStudent.get(e.studentId) ?? 0) * 100) / 100,
            existingTargetStatus:
              (existingByStudent.get(e.studentId) as
                | 'DRAFT'
                | 'ACTIVE'
                | 'WITHDRAWN'
                | 'GRADUATED'
                | undefined) ?? null,
          };
        });
      }

      const tenant = await tx.tenant.findFirst({ select: { currency: true } });
      return { years, levels, sourceYearId, targetYearId, rows, currency: tenant?.currency ?? 'MAD' };
    },
  );

  const yearOpts: YearOpt[] = years.map((y) => ({
    id: y.id,
    label: y.label,
    active: y.active,
  }));

  if (years.length < 2) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <Breadcrumb locale={locale} t={t} />
        <h1 className="mb-4 -mx-6 overflow-hidden rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-3 text-2xl font-semibold text-slate-900">{t('title')}</h1>
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-6 py-8 text-sm text-amber-900">
          {t('needTwoYears')}
          <Link
            href={`/${locale}/admin/settings/years`}
            className="ms-2 font-medium text-amber-800 hover:underline"
          >
            {t('goToYears')} →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <Breadcrumb locale={locale} t={t} />
      <h1 className="mb-4 -mx-6 overflow-hidden rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-3 text-2xl font-semibold text-slate-900">{t('title')}</h1>
      <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>

      <BulkReenrollSheet
        locale={locale}
        years={yearOpts}
        levels={levels}
        currency={currency}
        sourceYearId={sourceYearId ?? ''}
        targetYearId={targetYearId ?? ''}
        rows={rows}
      />
    </div>
  );
}

function Breadcrumb({
  locale,
  t,
}: {
  locale: string;
  t: (k: string) => string;
}) {
  return (
    <nav className="mb-3 text-xs text-slate-500">
      <Link href={`/${locale}/admin/enrollments`} className="hover:text-brand-700">
        {t('breadcrumbEnrollments')}
      </Link>
      <span className="mx-1.5">›</span>
      <span>{t('title')}</span>
    </nav>
  );
}
