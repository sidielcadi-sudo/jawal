import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { requireRoleCode } from '@/lib/auth/rbac';
import { withTenant } from '@/lib/db';
import { pickPeriodId } from '@/lib/periods';
import { loadActiveFramework } from '@/lib/competences';
import { computeReports } from '@/lib/competency-report';
import { ClassSynthesis } from '@/components/competences/class-synthesis';
import { CompetencyRadar, CompetencyBars } from '@/components/competences/radar';
import { BilanFilters, FreezeButton } from './client';
import { personDisplayName, localizedLabel } from '@/lib/localized-name';

export default async function CompetencesBilanPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ class?: string; period?: string; student?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  await requireRoleCode(['tenant_admin', 'direction', 'cpe', 'scolarite']);
  const session = (await auth())!;
  const t = await getTranslations('admin.competences');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const framework = await loadActiveFramework(tx);
    const year = await tx.academicYear.findFirst({
      where: { active: true },
      include: { periods: { orderBy: { startDate: 'asc' } } },
    });
    if (!framework || !year) return null;

    const classes = await tx.class.findMany({
      where: { academicYearId: year.id, deletedAt: null },
      select: { id: true, name: true, nameAr: true, levelId: true },
      orderBy: { name: 'asc' },
    });
    if (classes.length === 0) return { empty: true as const };

    const classId = classes.find((c) => c.id === sp.class)?.id ?? classes[0]!.id;
    const klass = classes.find((c) => c.id === classId)!;
    const periodId = pickPeriodId(year.periods, sp.period) ?? year.periods[0]?.id ?? null;
    if (!periodId) return { empty: true as const };

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

    // Colonnes = domaines du référentiel (ordre stable).
    const domainNodes = await tx.competencyNode.findMany({
      where: { frameworkId: framework.id, depth: 0 },
      select: { id: true, labelFr: true, kind: true },
      orderBy: { order: 'asc' },
    });

    // Dernier gel connu pour cette classe/période.
    const frozen = await tx.competencyReport.findFirst({
      where: { periodId, studentId: { in: studentIds } },
      orderBy: { generatedAt: 'desc' },
      select: { generatedAt: true },
    });

    const selectedStudentId = studentIds.includes(sp.student ?? '') ? sp.student! : null;
    const selected = selectedStudentId
      ? {
          id: selectedStudentId,
          name: (() => {
            const s = scs.find((x) => x.student.id === selectedStudentId)!.student;
            return personDisplayName(locale, s);
          })(),
          report: reports.get(selectedStudentId)!,
        }
      : null;

    return {
      classes: classes.map((c) => ({ id: c.id, label: localizedLabel(locale, c.name, c.nameAr) })),
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
      frozenAt: frozen ? frozen.generatedAt.toLocaleDateString(locale) : null,
      selected,
    };
  });

  if (!data || 'empty' in data) {
    return (
      <div className="px-3 py-3">
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <h2 className="text-lg font-semibold text-slate-700">{t('bilanTitle')}</h2>
          <p className="mt-2 text-sm text-slate-400">{t('noFramework')}</p>
          {/* Sans référentiel sur l'année, l'écran est un cul-de-sac : on renvoie
              là où on l'importe. */}
          <a
            href={`/${locale}/admin/settings/competences`}
            className="mt-3 inline-block rounded-lg border border-brand-300 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            {t('goToSettings')}
          </a>
        </div>
      </div>
    );
  }

  const base = `/${locale}/admin/competences/bilan`;
  const qs = `class=${data.classId}&period=${data.periodId}`;

  return (
    <div className="px-3 py-3">
      <header className="mb-4 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">📊 {t('bilanTitle')}</h1>
        <p className="mt-0.5 text-sm text-slate-600">{t('bilanSubtitle')}</p>
      </header>

      <nav className="folder-tabs mb-4">
        <a href={base} className="folder-tab is-active">
          {t('tabBilan')}
        </a>
        <a href={`/${locale}/admin/competences/remediation`} className="folder-tab">
          {t('tabRemediation')}
        </a>
      </nav>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-brand-200 bg-white px-4 py-3">
        <BilanFilters
          classes={data.classes}
          classId={data.classId}
          periods={data.periods}
          periodId={data.periodId}
        />
        <FreezeButton classId={data.classId} periodId={data.periodId} frozenAt={data.frozenAt} />
      </div>

      <ClassSynthesis
        rows={data.rows}
        domains={data.domains}
        labels={{
          student: t('student'),
          disciplinary: t('disciplinaryShort'),
          transversal: t('transversalShort'),
          coverage: t('coverageShort'),
          empty: t('noStudent'),
        }}
        hrefFor={(id) => `${base}?${qs}&student=${id}`}
      />

      {data.selected && (
        <section className="mt-5 rounded-2xl border border-brand-200 bg-white p-5">
          <h2 className="mb-1 text-base font-semibold text-slate-900">{data.selected.name}</h2>
          <p className="mb-4 text-xs text-slate-500">
            {t('disciplinaryShort')} :{' '}
            <strong>
              {data.selected.report.disciplinaryRate === null
                ? '—'
                : `${Math.round(data.selected.report.disciplinaryRate)}%`}
            </strong>{' '}
            · {t('transversalShort')} :{' '}
            <strong>
              {data.selected.report.transversalRate === null
                ? '—'
                : `${Math.round(data.selected.report.transversalRate)}%`}
            </strong>{' '}
            · {t('coverageShort')} : {data.selected.report.covered}/{data.selected.report.total}
          </p>

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

      <p className="mt-3 text-[11px] text-slate-400">{t('bilanHint')}</p>
    </div>
  );
}
