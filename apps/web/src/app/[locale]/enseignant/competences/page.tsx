import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getTeacherPersonId } from '@/lib/teacher';
import { pickPeriodId } from '@/lib/periods';
import { loadActiveFramework, loadLeaves, loadMasteryScale, evaluableBy } from '@/lib/competences';
import { ClassGrid } from './class-grid';
import { GridSelectors } from './selectors';
import { personDisplayName, localizedLabel } from '@/lib/localized-name';

const GENERAL = 'general';

export default async function TeacherCompetencesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ class?: string; period?: string; subject?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('enseignant.competences');
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
    if (!framework) return { noFramework: true as const };

    // Services : classes et matières du professeur.
    const select = { classId: true, subjectId: true, class: { select: { name: true, nameAr: true, levelId: true } } } as const;
    const [assignments, entries] = await Promise.all([
      tx.teacherAssignment.findMany({ where: { teacherId, academicYearId: year.id }, select }),
      tx.timetableEntry.findMany({ where: { teacherId, academicYearId: year.id }, select }),
    ]);
    const all = [...assignments, ...entries];
    const classes = [
      ...new Map(all.map((a) => [a.classId, { id: a.classId, name: localizedLabel(locale, a.class.name, a.class.nameAr), levelId: a.class.levelId }])).values(),
    ].sort((a, b) => a.name.localeCompare(b.name));
    if (classes.length === 0) return { noClass: true as const };

    const classId = classes.find((c) => c.id === sp.class)?.id ?? classes[0]!.id;
    const currentClass = classes.find((c) => c.id === classId)!;
    const periodId = pickPeriodId(year.periods, sp.period) ?? year.periods[0]?.id ?? null;

    const mySubjects = [
      ...new Set(all.filter((a) => a.classId === classId).map((a) => a.subjectId).filter((s): s is string => !!s)),
    ];

    // Feuilles évaluables par ce prof, actives pour le niveau de la classe.
    const leaves = await loadLeaves(tx, framework.id, { levelId: currentClass.levelId });
    const allowed = evaluableBy(leaves, mySubjects);
    const allowedIds = new Set(allowed.map((l) => l.id));
    const disc = allowed.filter((l) => l.kind === 'DISCIPLINARY');

    // Sélecteur de matière : matières du prof + « Compétences générales »
    // (compétences disciplinaires sans matière, ouvertes à tous).
    const subjectIds = [...new Set(disc.map((l) => l.subjectId).filter((s): s is string => !!s))];
    const hasGeneral = disc.some((l) => l.subjectId === null);
    const subjectsMeta = subjectIds.length
      ? await tx.subject.findMany({ where: { id: { in: subjectIds } }, orderBy: { label: 'asc' }, select: { id: true, label: true } })
      : [];
    const subjectOptions = [
      ...subjectsMeta.map((s) => ({ id: s.id, label: s.label })),
      ...(hasGeneral ? [{ id: GENERAL, label: t('grid.general') }] : []),
    ];
    const subjectId = subjectOptions.find((o) => o.id === sp.subject)?.id ?? subjectOptions[0]?.id ?? null;

    // Colonnes académiques = feuilles de la matière choisie.
    const academicLeaves = disc.filter((l) => (subjectId === GENERAL ? l.subjectId === null : l.subjectId === subjectId));

    // Colonnes aptitudes = groupes (depth 1) transversaux + leurs facettes actives.
    const aptNodes = await tx.competencyNode.findMany({
      where: { frameworkId: framework.id, kind: 'TRANSVERSAL' },
      select: { id: true, parentId: true, labelFr: true, depth: true, order: true, isLeaf: true },
      orderBy: [{ depth: 'asc' }, { order: 'asc' }],
    });
    const facetsByGroup = new Map<string, string[]>();
    for (const n of aptNodes) {
      if (n.isLeaf && n.parentId && allowedIds.has(n.id)) {
        facetsByGroup.set(n.parentId, [...(facetsByGroup.get(n.parentId) ?? []), n.id]);
      }
    }
    // Libellés des domaines (pour désambiguïser les aptitudes homonymes).
    const domainNodes = await tx.competencyNode.findMany({
      where: { frameworkId: framework.id, depth: 0 },
      select: { id: true, labelFr: true },
    });
    const domainLabel = new Map(domainNodes.map((d) => [d.id, d.labelFr]));
    const groups = aptNodes.filter((n) => n.depth === 1);
    const labelCount = new Map<string, number>();
    for (const g of groups) labelCount.set(g.labelFr, (labelCount.get(g.labelFr) ?? 0) + 1);
    const aptColumns = groups
      .map((g) => ({
        key: g.id,
        label: g.labelFr,
        // Domaine affiché seulement si l'aptitude existe dans plusieurs domaines.
        sublabel: (labelCount.get(g.labelFr) ?? 0) > 1 ? domainLabel.get(g.parentId ?? '') ?? null : null,
        kind: 'aptitude' as const,
        nodeIds: facetsByGroup.get(g.id) ?? [],
      }))
      .filter((c) => c.nodeIds.length > 0);

    const columns = [
      ...academicLeaves.map((l) => ({ key: l.id, label: l.label, kind: 'academic' as const, nodeIds: [l.id] })),
      ...aptColumns,
    ];

    const scale = await loadMasteryScale(tx);

    // Élèves actifs.
    const scs = await tx.studentClass.findMany({
      where: { classId, unenrolledAt: null, student: { deletedAt: null, enrollments: { some: { status: 'ACTIVE' } } } },
      include: { student: { select: { id: true, firstName: true, lastName: true, firstNameAr: true, lastNameAr: true } } },
      orderBy: { student: { lastName: 'asc' } },
    });
    const studentIds = scs.map((s) => s.student.id);

    // Mes évaluations existantes sur toutes les feuilles des colonnes.
    const allNodeIds = columns.flatMap((c) => c.nodeIds);
    const mineAll =
      periodId && allNodeIds.length && studentIds.length
        ? await tx.competencyAssessment.findMany({
            where: { periodId, evaluatedByUserId: session.user.id, studentId: { in: studentIds }, nodeId: { in: allNodeIds } },
            select: { studentId: true, nodeId: true, masteryLevelId: true },
          })
        : [];
    const mineMap = new Map(mineAll.map((a) => [`${a.studentId}|${a.nodeId}`, a.masteryLevelId]));

    const rows = scs.map((s) => {
      const values: Record<string, string | null> = {};
      for (const c of columns) {
        if (c.kind === 'academic') {
          values[c.key] = mineMap.get(`${s.student.id}|${c.nodeIds[0]}`) ?? null;
        } else {
          // Aptitude : niveau si toutes les facettes sont au même niveau, sinon vide.
          const levels = c.nodeIds.map((id) => mineMap.get(`${s.student.id}|${id}`) ?? null);
          const set = new Set(levels);
          values[c.key] = set.size === 1 && !set.has(null) ? levels[0]! : null;
        }
      }
      return { studentId: s.student.id, name: personDisplayName(locale, s.student), values };
    });

    return {
      classes: classes.map((c) => ({ id: c.id, label: c.name })),
      classId,
      periods: year.periods.map((p) => ({ id: p.id, label: p.label, labelAr: p.labelAr })),
      periodId,
      subjects: subjectOptions,
      subjectId,
      columns,
      scale,
      rows,
      hasColumns: columns.length > 0,
    };
  });

  if (!data) return <div className="px-3 py-3 text-sm text-slate-500">{t('noAccess')}</div>;
  if ('noFramework' in data) return <Wrap title={t('title')} note={t('noFramework')} />;
  if ('noClass' in data) return <Wrap title={t('title')} note={t('noClass')} />;

  const className = data.classes.find((c) => c.id === data.classId)?.label ?? '';
  const subjectName = data.subjects.find((s) => s.id === data.subjectId)?.label ?? '';

  return (
    <div className="px-3 py-3">
      <header className="mb-4 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">🎯 {t('grid.title')}</h1>
        <p className="mt-0.5 text-sm text-slate-600">
          {t('grid.classLabel', { subject: subjectName, class: className })}
        </p>
      </header>

      <nav className="folder-tabs mb-4">
        <a href={`/${locale}/enseignant/competences`} className="folder-tab is-active">
          {t('tabSaisie')}
        </a>
        <a href={`/${locale}/enseignant/competences/bilan`} className="folder-tab">
          {t('tabBilan')}
        </a>
      </nav>

      <GridSelectors
        classes={data.classes}
        classId={data.classId}
        periods={data.periods}
        periodId={data.periodId}
        subjects={data.subjects}
        subjectId={data.subjectId}
      />

      <div className="mt-4">
        {data.periodId && data.hasColumns ? (
          <ClassGrid
            key={`${data.classId}-${data.periodId}-${data.subjectId}`}
            periodId={data.periodId}
            scale={data.scale}
            columns={data.columns}
            rows={data.rows}
          />
        ) : (
          <Wrap title={t('title')} note={t('noItem')} />
        )}
      </div>
    </div>
  );
}

function Wrap({ title, note }: { title: string; note: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <h2 className="text-lg font-semibold text-slate-700">{title}</h2>
      <p className="mt-2 text-sm text-slate-400">{note}</p>
    </div>
  );
}
