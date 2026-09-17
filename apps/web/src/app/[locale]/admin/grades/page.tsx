import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { requireRoleCode } from '@/lib/auth/rbac';
import { withTenant } from '@/lib/db';
import { computeClassBook } from '@/lib/grades';
import { pickPeriodId } from '@/lib/periods';
import { personDisplayName, localizedLabel } from '@/lib/localized-name';
import { isOfficialKind, todayIso, type ExamKindValue } from '@/lib/exam-kinds';
import {
  gradeStats,
  inferEvaluationKind,
  trackingStatus,
  type TrackingRow,
} from '@/lib/grades-tracking';
import { ExportNotesButton } from './export-button';
import { GradesTracking, type PeriodGroup } from './tracking';

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];
const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Notes — suivi des notes, évaluations et examens de l'établissement.
 *
 * En tête, le pilotage : indicateurs, filtres et une ligne par épreuve, qu'elle
 * vienne d'une évaluation de classe ou d'une session d'examen. En dessous, le
 * détail d'une classe (synthèse, évaluation en cours, raccourcis, répartition).
 * Cette page ne saisit rien : elle renvoie vers les écrans qui détiennent
 * l'écriture.
 */
export default async function GradesOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ class?: string; period?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  await requireRoleCode(['tenant_admin', 'direction', 'scolarite']);
  const session = (await auth())!;
  const t = await getTranslations('admin.gradesOverview');
  const today = todayIso();

  const data = await withTenant(session.user.tenantId, async (tx) => {
    // Toutes les années : le sélecteur de période les regroupe, ce qui garde
    // les notes des exercices clos consultables sans filtre d'année séparé.
    const years = await tx.academicYear.findMany({
      orderBy: { startDate: 'desc' },
      select: {
        id: true,
        label: true,
        active: true,
        periods: {
          orderBy: { startDate: 'asc' },
          select: { id: true, label: true, labelAr: true, startDate: true, endDate: true },
        },
      },
    });
    const active = years.find((y) => y.active) ?? years[0];
    if (!active) return null;

    const requested = sp.period
      ? years.flatMap((y) => y.periods.map((p) => ({ y, p }))).find((x) => x.p.id === sp.period)
      : undefined;
    const year = requested?.y ?? active;
    const periodId = requested?.p.id ?? pickPeriodId(active.periods);
    const period = year.periods.find((p) => p.id === periodId) ?? null;

    // Période précédente, dans l'ordre chronologique — éventuellement sur
    // l'année d'avant (T1 se compare au dernier trimestre de l'an passé).
    const chrono = years
      .flatMap((y) => y.periods.map((p) => ({ ...p, yearId: y.id })))
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    const index = chrono.findIndex((p) => p.id === periodId);
    const prev = index > 0 ? chrono[index - 1]! : null;

    const classes = await tx.class.findMany({
      where: { academicYearId: year.id, deletedAt: null },
      select: { id: true, name: true, nameAr: true, levelId: true, trackId: true },
      orderBy: [{ level: { order: 'asc' } }, { name: 'asc' }],
    });
    const selectedClass = classes.find((c) => c.id === sp.class) ?? null;

    const rows = period
      ? await buildRows(tx, locale, today, { period, yearId: year.id, cls: selectedClass })
      : [];
    // Une classe n'existe que sur son année : filtrée, elle n'a pas
    // d'équivalent sur une période d'une autre année — pas de comparaison.
    const prevRows =
      prev && (prev.yearId === year.id || !selectedClass)
        ? await buildRows(tx, locale, today, {
            period: prev,
            yearId: prev.yearId,
            cls: prev.yearId === year.id ? selectedClass : null,
          })
        : [];

    /* ── Détail d'une classe : la classe filtrée, sinon la première ─────── */
    const blockClass = selectedClass ?? classes[0] ?? null;
    let blocks = null;
    if (blockClass && periodId) {
      const program = blockClass.trackId
        ? await tx.trackSubjectCoefficient.findMany({
            where: { trackId: blockClass.trackId },
            select: { subject: { select: { id: true, label: true, labelAr: true } } },
          })
        : await tx.curriculumSubject.findMany({
            where: { levelId: blockClass.levelId },
            select: { subject: { select: { id: true, label: true, labelAr: true } } },
            orderBy: [{ order: 'asc' }],
          });
      const subjects = program.map((x) => ({
        id: x.subject.id,
        label: localizedLabel(locale, x.subject.label, x.subject.labelAr),
      }));

      const students = await tx.studentClass.findMany({
        where: { classId: blockClass.id, unenrolledAt: null },
        select: {
          student: {
            select: { id: true, firstName: true, lastName: true, firstNameAr: true, lastNameAr: true },
          },
        },
        orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
      });

      // Moteur des bulletins : les chiffres du détail sont les mêmes partout.
      const allSubjects = await tx.subject.findMany({
        select: { id: true, label: true, labelAr: true, coefficient: true, scale: true, order: true },
        orderBy: [{ order: 'asc' }, { label: 'asc' }],
      });
      const book = await computeClassBook(tx, {
        classId: blockClass.id,
        periodId,
        students: students.map((s) => s.student),
        allSubjects: allSubjects.map((s) => ({
          id: s.id,
          label: localizedLabel(locale, s.label, s.labelAr),
          coefficient: s.coefficient,
          scale: s.scale,
          order: s.order,
        })),
      });

      const current = await tx.evaluation.findFirst({
        where: { classId: blockClass.id, periodId },
        orderBy: { date: 'desc' },
        select: {
          label: true,
          date: true,
          weight: true,
          maxValue: true,
          optional: true,
          subject: { select: { label: true, labelAr: true } },
          grades: { select: { value: true } },
        },
      });

      blocks = { cls: blockClass, subjects, studentCount: students.length, book, current };
    }

    return { years, year, periodId, classes, selectedClass, rows, prevRows, blocks };
  });

  if (!data) {
    return (
      <div className="px-3 py-3">
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          {t('noYear')}
        </p>
      </div>
    );
  }

  const { years, year, periodId, classes, selectedClass, rows, prevRows, blocks } = data;

  const periodGroups: PeriodGroup[] = years
    .filter((y) => y.periods.length > 0)
    .map((y) => ({
      yearLabel: y.active ? `${y.label} ★` : y.label,
      periods: y.periods.map((p) => ({ id: p.id, label: localizedLabel(locale, p.label, p.labelAr) })),
    }));

  /* ── Détail de la classe : synthèse, répartition, évaluation en cours ─── */
  const rated = blocks
    ? blocks.book.rows.map((r) => r.generalAverage).filter((v): v is number => v !== null)
    : [];
  const classAverage = rated.length
    ? Math.round((rated.reduce((a, b) => a + b, 0) / rated.length) * 10) / 10
    : null;
  const passed = rated.filter((v) => v >= 10).length;
  const successPct = rated.length ? Math.round((passed / rated.length) * 100) : 0;

  const buckets = [
    { key: '90', min: 18, tone: 'bg-emerald-500' },
    { key: '70', min: 14, tone: 'bg-lime-500' },
    { key: '50', min: 10, tone: 'bg-amber-500' },
    { key: '0', min: 0, tone: 'bg-red-500' },
  ].map((b, i, arr) => {
    const max = i === 0 ? 21 : arr[i - 1]!.min;
    const n = rated.filter((v) => v >= b.min && v < max).length;
    return { ...b, count: n, pct: rated.length ? Math.round((n / rated.length) * 100) : 0 };
  });

  const weakest = blocks
    ? [...blocks.book.classSubjectAverages.entries()]
        .filter((e): e is [string, number] => e[1] !== null)
        .map(([sid, avg]) => ({
          label: blocks.subjects.find((s) => s.id === sid)?.label ?? sid,
          avg,
        }))
        .sort((a, b) => a.avg - b.avg)
        .slice(0, 5)
    : [];

  const current = blocks?.current ?? null;
  const currentFilled =
    current && blocks
      ? Math.round(
          (current.grades.filter((g) => g.value !== null).length / Math.max(1, blocks.studentCount)) * 100,
        )
      : 0;

  /* ── Export : les moyennes de la classe détaillée, par matière ─────────── */
  const exportHeader = blocks
    ? ['#', t('student'), ...blocks.subjects.map((s) => s.label), t('generalAverage')]
    : [];
  const exportRows = blocks
    ? blocks.book.rows
        .filter((r) => r.generalAverage !== null)
        .map((r, i) => [
          String(i + 1),
          personDisplayName(locale, r),
          ...blocks.subjects.map((s) => {
            const avg = r.subjects.find((x) => x.subjectId === s.id)?.average ?? null;
            return avg === null ? '' : avg.toFixed(2);
          }),
          r.generalAverage === null ? '' : r.generalAverage.toFixed(2),
        ])
    : [];
  const periodLabel = year.periods.find((p) => p.id === periodId)?.label ?? '';
  const exportName = ['notes', blocks?.cls.name ?? '', periodLabel].filter(Boolean).join('-');
  const cls = blocks?.cls ?? null;

  return (
    <div className="px-3 py-3">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <div>
          <h1 className="text-base font-bold text-slate-900">{t('headerTitle', { year: year.label })}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {cls && (
            <Link
              href={`/${locale}/admin/classes/${cls.id}/bulletins`}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              {t('printReport')}
            </Link>
          )}
          <ExportNotesButton
            header={exportHeader}
            rows={exportRows}
            filename={exportName}
            label={t('exportNotes')}
            emptyLabel={t('exportEmpty')}
          />
          <Link
            href={`/${locale}/admin/exams`}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
          >
            {t('scheduleExam')}
          </Link>
        </div>
      </header>

      <GradesTracking
        locale={locale}
        rows={rows}
        prevRows={prevRows}
        periodGroups={periodGroups}
        periodId={periodId ?? ''}
        classes={classes.map((c) => ({ id: c.id, label: localizedLabel(locale, c.name, c.nameAr) }))}
        classId={selectedClass?.id ?? ''}
        canRemind={year.active}
      />

      {cls && (
        <>
          <div className="mt-6 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-800">
              {t('blocksFor', { class: localizedLabel(locale, cls.name, cls.nameAr) })}
            </h2>
            {!selectedClass && <p className="text-xs text-slate-500">{t('blocksHint')}</p>}
          </div>

          <div className="mt-3 flex flex-col gap-4 xl:flex-row xl:items-start">
            {/* Cartes de synthèse */}
            <div className="grid min-w-0 flex-1 grid-cols-1 gap-4 md:grid-cols-3">
              <Card icon="📈" title={t('generalAverage')}>
                <p className="text-3xl font-bold tabular-nums text-slate-900">
                  {classAverage === null ? '—' : classAverage.toFixed(1)}
                  <span className="ms-1 text-base font-normal text-slate-400">/20</span>
                </p>
                <p className="mt-1 text-xs text-slate-500">{t('generalAverageHint')}</p>
              </Card>

              <Card icon="🎯" title={t('successRate')}>
                <p className="text-3xl font-bold tabular-nums text-slate-900">{successPct}%</p>
                <p className="mt-1 text-xs text-slate-500">
                  {t('successHint', { passed, total: rated.length })}
                </p>
              </Card>

              <Card icon="⚠" title={t('weakSubjects')}>
                {weakest.length === 0 ? (
                  <p className="text-xs text-slate-400">{t('noSubjectAverage')}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {weakest.map((w) => (
                      <li key={w.label}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="truncate text-slate-700">{w.label}</span>
                          <span className="tabular-nums text-slate-500">{w.avg.toFixed(1)} /20</span>
                        </div>
                        <div className="mt-0.5 h-1.5 rounded bg-slate-100">
                          <div
                            className={`h-1.5 rounded ${
                              w.avg >= 14 ? 'bg-emerald-500' : w.avg >= 10 ? 'bg-amber-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${Math.min(100, (w.avg / 20) * 100)}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            {/* Colonne de droite */}
            <aside className="w-full shrink-0 space-y-4 xl:w-[320px]">
              <section className="rounded-2xl border border-brand-200 bg-white p-4">
                <h2 className="text-sm font-semibold text-slate-800">{t('currentEval')}</h2>
                {!current ? (
                  <p className="mt-2 text-xs text-slate-400">{t('noEval')}</p>
                ) : (
                  <>
                    <p className="mt-2 text-sm font-medium text-slate-900">
                      {current.label}
                      <span className="ms-1 text-xs font-normal text-slate-500">
                        · {localizedLabel(locale, current.subject.label, current.subject.labelAr)}
                      </span>
                    </p>
                    <dl className="mt-3 space-y-2 text-xs">
                      <Row label={t('date')} value={current.date.toLocaleDateString(locale)} />
                      <Row label={t('weight')} value={String(current.weight)} />
                      <Row label={t('scale')} value={`/${current.maxValue}`} />
                      <Row label={t('optional')} value={current.optional ? t('yes') : t('no')} />
                    </dl>
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>{t('entryStatus')}</span>
                        <span className="tabular-nums">{currentFilled}%</span>
                      </div>
                      <div className="mt-1 h-2 rounded bg-slate-100">
                        <div
                          className={`h-2 rounded ${currentFilled === 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                          style={{ width: `${currentFilled}%` }}
                        />
                      </div>
                    </div>
                    <Link
                      href={`/${locale}/admin/classes/${cls.id}/grades?period=${periodId ?? ''}`}
                      className="mt-3 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-center text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {t('seeEval')}
                    </Link>
                  </>
                )}
              </section>

              <section className="rounded-2xl border border-brand-200 bg-white p-4">
                <h2 className="mb-2 text-sm font-semibold text-slate-800">{t('shortcuts')}</h2>
                <ul className="space-y-1 text-sm">
                  <Shortcut href={`/${locale}/admin/classes/${cls.id}/grades`} label={t('scEnter')} />
                  <Shortcut href={`/${locale}/admin/classes/${cls.id}/grade-book`} label={t('scBook')} />
                  <Shortcut href={`/${locale}/admin/classes/${cls.id}/bulletins`} label={t('scReports')} />
                  <Shortcut href={`/${locale}/admin/competences/bilan`} label={t('scCompetences')} />
                </ul>
              </section>

              <section className="rounded-2xl border border-brand-200 bg-white p-4">
                <h2 className="mb-3 text-sm font-semibold text-slate-800">{t('distribution')}</h2>
                {rated.length === 0 ? (
                  <p className="text-xs text-slate-400">{t('noGrade')}</p>
                ) : (
                  <ul className="space-y-2">
                    {buckets.map((b) => (
                      <li key={b.key} className="flex items-center gap-2 text-xs">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${b.tone}`} />
                        <span className="flex-1 text-slate-600">{t(`bucket.${b.key}` as never)}</span>
                        <span className="tabular-nums text-slate-800">
                          {b.count} <span className="text-slate-400">({b.pct}%)</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-[11px] text-slate-400">
                  {t('ratedOf', { rated: rated.length, total: blocks?.studentCount ?? 0 })}
                </p>
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Lignes du suivi pour une période : évaluations de classe et épreuves
 * d'examen, avec leur saisie, leur moyenne et leur statut.
 */
async function buildRows(
  tx: Tx,
  locale: string,
  today: string,
  {
    period,
    yearId,
    cls,
  }: {
    period: { id: string; startDate: Date; endDate: Date };
    yearId: string;
    cls: { id: string; levelId: string; trackId: string | null } | null;
  },
): Promise<TrackingRow[]> {
  const name = (p: { firstName: string; lastName: string; firstNameAr: string | null; lastNameAr: string | null }) =>
    personDisplayName(locale, p);
  const personSelect = { firstName: true, lastName: true, firstNameAr: true, lastNameAr: true } as const;

  /* ── Évaluations de classe ─────────────────────────────────────────────── */
  const evaluations = await tx.evaluation.findMany({
    where: { periodId: period.id, ...(cls ? { classId: cls.id } : {}) },
    select: {
      id: true,
      label: true,
      date: true,
      weight: true,
      maxValue: true,
      classId: true,
      subjectId: true,
      class: { select: { name: true, nameAr: true } },
      subject: { select: { label: true, labelAr: true } },
      grades: { select: { value: true } },
      examPaper: { select: { session: { select: { kind: true } } } },
    },
  });
  const classIds = [...new Set(evaluations.map((e) => e.classId))];
  const [counts, assignments] = await Promise.all([
    tx.studentClass.groupBy({
      by: ['classId'],
      where: { classId: { in: classIds }, unenrolledAt: null },
      _count: { _all: true },
    }),
    // Une évaluation ne porte pas son enseignant : c'est celui (ou ceux)
    // affecté(s) à la matière dans la classe.
    tx.teacherAssignment.findMany({
      where: { classId: { in: classIds }, academicYearId: yearId },
      select: { classId: true, subjectId: true, teacher: { select: personSelect } },
    }),
  ]);
  const expectedByClass = new Map(counts.map((c) => [c.classId, c._count._all]));
  const teachersBy = new Map<string, string[]>();
  for (const a of assignments) {
    const k = `${a.classId}|${a.subjectId}`;
    teachersBy.set(k, [...(teachersBy.get(k) ?? []), name(a.teacher)]);
  }

  const out: TrackingRow[] = evaluations.map((e) => {
    const stats = gradeStats(e.grades.map((g) => g.value), e.maxValue);
    const entered = e.grades.filter((g) => g.value !== null).length;
    const expected = expectedByClass.get(e.classId) ?? 0;
    const date = iso(e.date);
    return {
      id: e.id,
      source: 'EVALUATION',
      label: e.label,
      // Devoir issu d'une session d'examen : son type est celui de la session.
      kind: e.examPaper ? (e.examPaper.session.kind as ExamKindValue) : inferEvaluationKind(e.label),
      classId: e.classId,
      classLabel: localizedLabel(locale, e.class.name, e.class.nameAr),
      subjectLabel: localizedLabel(locale, e.subject.label, e.subject.labelAr),
      teacherLabel: (teachersBy.get(`${e.classId}|${e.subjectId}`) ?? []).join(', ') || '—',
      date,
      coefficient: e.weight,
      entered,
      expected,
      sum20: stats.sum20,
      count: stats.count,
      passed: stats.passed,
      average: stats.average,
      href: `/${locale}/admin/classes/${e.classId}/grades?period=${period.id}&subject=${e.subjectId}`,
      status: trackingStatus({ entered, expected, date }, today),
    };
  });

  /* ── Épreuves d'examen ─────────────────────────────────────────────────── */
  const papers = await tx.examPaper.findMany({
    where: { session: { academicYearId: yearId, OR: [{ periodId: period.id }, { periodId: null }] } },
    select: {
      id: true,
      date: true,
      coefficient: true,
      maxValue: true,
      subject: { select: { label: true, labelAr: true } },
      graders: { select: { teacher: { select: personSelect } } },
      marks: { select: { value: true, absent: true } },
      evaluations: { select: { id: true }, take: 1 },
      session: {
        select: {
          id: true,
          label: true,
          kind: true,
          periodId: true,
          levelId: true,
          level: { select: { label: true, labelAr: true } },
          tracks: { select: { trackId: true } },
        },
      },
    },
  });

  // Une session rattachée à la période en fait partie ; sans rattachement,
  // c'est la date de l'épreuve qui décide.
  const relevant = papers.filter((p) => {
    const inPeriod =
      p.session.periodId === period.id ||
      (p.session.periodId === null && p.date >= period.startDate && p.date <= period.endDate);
    if (!inPeriod) return false;
    // Examen interne publié : ses devoirs de classe portent les notes, la ligne
    // d'épreuve ferait doublon.
    if (!isOfficialKind(p.session.kind) && p.evaluations.length > 0) return false;
    if (!cls) return true;
    const trackIds = p.session.tracks.map((x) => x.trackId);
    return (
      p.session.levelId === cls.levelId &&
      (trackIds.length === 0 || (cls.trackId !== null && trackIds.includes(cls.trackId)))
    );
  });

  // Copies attendues : les élèves du niveau (et des filières) de la session.
  const expectedBySession = new Map<string, number>();
  for (const p of relevant) {
    if (expectedBySession.has(p.session.id)) continue;
    const trackIds = p.session.tracks.map((x) => x.trackId);
    expectedBySession.set(
      p.session.id,
      await tx.studentClass.count({
        where: {
          unenrolledAt: null,
          class: {
            academicYearId: yearId,
            deletedAt: null,
            levelId: p.session.levelId,
            ...(trackIds.length > 0 ? { trackId: { in: trackIds } } : {}),
          },
        },
      }),
    );
  }

  for (const p of relevant) {
    // Un absent est une copie traitée : elle ne manque pas à la saisie.
    const entered = p.marks.filter((m) => m.value !== null || m.absent).length;
    const expected = expectedBySession.get(p.session.id) ?? 0;
    const stats = gradeStats(p.marks.map((m) => m.value), p.maxValue);
    const date = iso(p.date);
    out.push({
      id: p.id,
      source: 'EXAM',
      label: p.session.label,
      kind: p.session.kind as ExamKindValue,
      classId: null,
      classLabel: localizedLabel(locale, p.session.level.label, p.session.level.labelAr),
      subjectLabel: localizedLabel(locale, p.subject.label, p.subject.labelAr),
      teacherLabel: p.graders.map((g) => name(g.teacher)).join(', ') || '—',
      date,
      coefficient: p.coefficient,
      entered,
      expected,
      sum20: stats.sum20,
      count: stats.count,
      passed: stats.passed,
      average: stats.average,
      href: `/${locale}/admin/exams/${p.session.id}`,
      status: trackingStatus({ entered, expected, date }, today),
    });
  }

  return out.sort((a, b) => b.date.localeCompare(a.date));
}

function Card({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-brand-200 bg-white p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-sm">{icon}</span>
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800">{value}</dd>
    </div>
  );
}

function Shortcut({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center justify-between rounded-lg px-2 py-1.5 text-slate-700 hover:bg-slate-50"
      >
        <span>{label}</span>
        <span className="text-slate-400">›</span>
      </Link>
    </li>
  );
}
