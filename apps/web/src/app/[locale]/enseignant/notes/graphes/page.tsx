import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getTeacherPersonId } from '@/lib/teacher';
import { pickPeriodId } from '@/lib/periods';
import { loadActiveFramework } from '@/lib/competences';
import { computeReports, type DomainBreakdown } from '@/lib/competency-report';
import { CompetencyRadar } from '@/components/competences/radar';
import { localizedLabel } from '@/lib/localized-name';
import { PeriodPicker } from '@/components/period-picker';

/**
 * Onglet « Graphes » : le radar de compétences du bilan, mais agrégé sur toute
 * la classe — chaque axe porte la moyenne des taux d'acquisition des élèves
 * évalués sur ce domaine (les non-évalués sont exclus, pas comptés zéro : les
 * tirer vers le bas fausserait la lecture en début de période).
 */
export default async function GraphesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ class?: string; period?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('enseignant.notes');
  const session = await auth();
  if (!session?.user) return null;

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const teacherId = await getTeacherPersonId(tx, session.user.id);
    const year = await tx.academicYear.findFirst({
      where: { active: true },
      include: { periods: { orderBy: { startDate: 'asc' } } },
    });
    if (!teacherId || !year) return null;
    const framework = await loadActiveFramework(tx);
    if (!framework) return null;

    // Classes du prof : affectations + créneaux d'EDT, comme dans le bilan.
    const select = { classId: true, class: { select: { name: true, nameAr: true, levelId: true } } } as const;
    const [assignments, entries] = await Promise.all([
      tx.teacherAssignment.findMany({ where: { teacherId, academicYearId: year.id }, select }),
      tx.timetableEntry.findMany({ where: { teacherId, academicYearId: year.id }, select }),
    ]);
    const classes = [
      ...new Map(
        [...assignments, ...entries].map((a) => [
          a.classId,
          { id: a.classId, label: localizedLabel(locale, a.class.name, a.class.nameAr), levelId: a.class.levelId },
        ]),
      ).values(),
    ].sort((a, b) => a.label.localeCompare(b.label));
    if (classes.length === 0) return null;

    const classId = classes.find((c) => c.id === sp.class)?.id ?? classes[0]!.id;
    const klass = classes.find((c) => c.id === classId)!;
    const periodId = pickPeriodId(year.periods, sp.period) ?? year.periods[0]?.id ?? null;
    if (!periodId) return null;

    const scs = await tx.studentClass.findMany({
      where: { classId, unenrolledAt: null, student: { deletedAt: null, enrollments: { some: { status: 'ACTIVE' } } } },
      select: { student: { select: { id: true } } },
    });
    const studentIds = scs.map((s) => s.student.id);
    const reports = await computeReports(tx, {
      frameworkId: framework.id,
      periodId,
      studentIds,
      levelId: klass.levelId,
    });

    // Moyenne des radars : même liste de domaines pour tous les élèves, on
    // moyenne axe par axe sur les seuls élèves qui y ont un taux.
    const all = [...reports.values()];
    const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
    const domains: DomainBreakdown[] =
      all[0]?.domains.map((d, i) => ({
        ...d,
        rate: mean(all.map((r) => r.domains[i]?.rate).filter((v): v is number => v != null)),
        covered: all.reduce((s, r) => s + (r.domains[i]?.covered ?? 0), 0),
        total: all.reduce((s, r) => s + (r.domains[i]?.total ?? 0), 0),
        competencies: d.competencies.map((c, j) => ({
          ...c,
          rate: mean(
            all.map((r) => r.domains[i]?.competencies[j]?.rate).filter((v): v is number => v != null),
          ),
          covered: all.reduce((s, r) => s + (r.domains[i]?.competencies[j]?.covered ?? 0), 0),
          total: all.reduce((s, r) => s + (r.domains[i]?.competencies[j]?.total ?? 0), 0),
        })),
      })) ?? [];

    return {
      classes,
      classId,
      periods: year.periods.map((p) => ({ id: p.id, label: p.label, labelAr: p.labelAr })),
      periodId,
      domains,
      studentCount: studentIds.length,
      // Élèves ayant au moins un domaine évalué : dénominateur réel du radar.
      gradedCount: all.filter((r) => r.domains.some((d) => d.rate !== null)).length,
    };
  });

  if (!data) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-10 text-center text-sm text-slate-500">
        {t('graphesEmpty')}
      </div>
    );
  }

  const base = `/${locale}/enseignant/notes/graphes`;

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {data.classes.map((c) => (
          <Link
            key={c.id}
            href={`${base}?class=${c.id}&period=${data.periodId}`}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              c.id === data.classId
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {c.label}
          </Link>
        ))}
        <span className="mx-2 self-center text-slate-300">|</span>
        <PeriodPicker periods={data.periods} selectedId={data.periodId} locale={locale} />
      </div>

      <section className="rounded-2xl border border-brand-200 bg-white p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-700">{t('graphesRadarTitle')}</h2>
          <span className="text-xs text-slate-500">
            {t('graphesGraded', { graded: data.gradedCount, total: data.studentCount })}
          </span>
        </div>
        {data.gradedCount === 0 ? (
          <p className="py-8 text-center text-xs italic text-slate-400">{t('graphesNoData')}</p>
        ) : (
          <CompetencyRadar domains={data.domains} />
        )}
      </section>
    </div>
  );
}
