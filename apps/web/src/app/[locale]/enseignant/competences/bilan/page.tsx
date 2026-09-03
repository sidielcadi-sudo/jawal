import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getTeacherPersonId } from '@/lib/teacher';
import { pickPeriodId } from '@/lib/periods';
import { loadActiveFramework } from '@/lib/competences';
import { computeReports } from '@/lib/competency-report';
import { ClassSynthesis } from '@/components/competences/class-synthesis';
import { CompetencyRadar, CompetencyBars } from '@/components/competences/radar';
import { personDisplayName, localizedLabel } from '@/lib/localized-name';
import { PeriodPicker } from '@/components/period-picker';

/** Synthèse de classe côté enseignant (lecture seule : le gel reste à la direction). */
export default async function TeacherBilanPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ class?: string; period?: string; student?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('enseignant.competences');
  const ta = await getTranslations('admin.competences');
  // Cf. page de saisie : garde-fou contre un rendu sans session.
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
      include: { student: { select: { id: true, firstName: true, lastName: true, firstNameAr: true, lastNameAr: true } } },
      orderBy: { student: { lastName: 'asc' } },
    });
    const studentIds = scs.map((s) => s.student.id);
    const reports = await computeReports(tx, {
      frameworkId: framework.id,
      periodId,
      studentIds,
      levelId: klass.levelId,
    });
    const domainNodes = await tx.competencyNode.findMany({
      where: { frameworkId: framework.id, depth: 0 },
      select: { id: true, labelFr: true, kind: true },
      orderBy: { order: 'asc' },
    });

    const selectedId = studentIds.includes(sp.student ?? '') ? sp.student! : null;

    return {
      classes,
      classId,
      periods: year.periods.map((p) => ({ id: p.id, label: p.label, labelAr: p.labelAr })),
      periodId,
      domains: domainNodes.map((d) => ({
        id: d.id,
        label: d.labelFr,
        kind: d.kind as 'DISCIPLINARY' | 'TRANSVERSAL',
      })),
      rows: scs.map((s) => ({
        studentId: s.student.id,
        name: personDisplayName(locale, s.student),
        report: reports.get(s.student.id)!,
      })),
      selected: selectedId
        ? {
            name: (() => {
              const s = scs.find((x) => x.student.id === selectedId)!.student;
              return personDisplayName(locale, s);
            })(),
            report: reports.get(selectedId)!,
          }
        : null,
    };
  });

  if (!data) return <div className="px-3 py-3 text-sm text-slate-500">{t('noAccess')}</div>;

  const base = `/${locale}/enseignant/competences/bilan`;
  const link = (extra: string) => `${base}?class=${data.classId}&period=${data.periodId}${extra}`;

  return (
    <div className="px-3 py-3">
      <header className="mb-4 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">📊 {t('bilanTitle')}</h1>
        <p className="mt-0.5 text-sm text-slate-600">{t('bilanSubtitle')}</p>
      </header>

      <nav className="folder-tabs mb-4">
        <Link href={`/${locale}/enseignant/competences`} className="folder-tab">
          {t('tabSaisie')}
        </Link>
        <Link href={base} className="folder-tab is-active">
          {t('tabBilan')}
        </Link>
      </nav>

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

      <ClassSynthesis
        rows={data.rows}
        domains={data.domains}
        labels={{
          student: ta('student'),
          disciplinary: ta('disciplinaryShort'),
          transversal: ta('transversalShort'),
          coverage: ta('coverageShort'),
          empty: t('noStudent'),
        }}
        hrefFor={(id) => link(`&student=${id}`)}
      />

      {data.selected && (
        <section className="mt-5 rounded-2xl border border-brand-200 bg-white p-5">
          <h2 className="mb-4 text-base font-semibold text-slate-900">{data.selected.name}</h2>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <CompetencyRadar domains={data.selected.report.domains} />
            <div className="space-y-4">
              {data.selected.report.domains.map((d) => (
                <div key={d.id}>
                  <h3 className="mb-1.5 text-sm font-semibold text-slate-700">{d.label}</h3>
                  <CompetencyBars domain={d} />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
