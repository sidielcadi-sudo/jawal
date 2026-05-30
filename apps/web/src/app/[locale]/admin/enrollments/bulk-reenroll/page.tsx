import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { proposeNextLevel } from '@/lib/level-progression';
import { BulkReenrollSheet, type Row, type YearOpt, type LevelOpt } from './sheet';

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

  const { years, levels, sourceYearId, targetYearId, rows } = await withTenant(
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
        include: { cycle: { select: { id: true, order: true, label: true } } },
        orderBy: [{ cycle: { order: 'asc' } }, { order: 'asc' }],
      });
      const levels: LevelOpt[] = levelsRaw.map((l) => ({
        id: l.id,
        label: l.label,
        cycleId: l.cycleId,
        cycleLabel: l.cycle.label,
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
            student: { select: { id: true, firstName: true, lastName: true } },
            level: { select: { label: true, cycleId: true } },
            class: { select: { name: true } },
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

        rows = sourceEnrollments.map((e) => {
          const suggested = proposeNextLevel(e.levelId, levels);
          const suggestedFull = suggested ? levels.find((l) => l.id === suggested.id) : null;
          return {
            sourceEnrollmentId: e.id,
            studentId: e.studentId,
            firstName: e.student.firstName,
            lastName: e.student.lastName,
            currentLevelId: e.levelId,
            currentLevelLabel: e.level.label,
            currentClassName: e.class?.name ?? null,
            currentStatus: e.status as 'ACTIVE' | 'DRAFT',
            suggestedNextLevelId: suggested?.id ?? null,
            suggestedNextLevelLabel: suggestedFull?.label ?? null,
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

      return { years, levels, sourceYearId, targetYearId, rows };
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
        <h1 className="text-2xl font-semibold text-slate-900">{t('title')}</h1>
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
      <h1 className="text-2xl font-semibold text-slate-900">{t('title')}</h1>
      <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>

      <BulkReenrollSheet
        locale={locale}
        years={yearOpts}
        levels={levels}
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
