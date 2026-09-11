import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { requireRoleCode } from '@/lib/auth/rbac';
import { withTenant } from '@/lib/db';
import { computeClassBook, computeMention } from '@/lib/grades';
import { pickPeriodId } from '@/lib/periods';
import { personDisplayName, localizedLabel } from '@/lib/localized-name';
import { GradeFilters } from './filters';

const MENTION_TONE: Record<string, string> = {
  EXCELLENT: 'bg-emerald-100 text-emerald-800',
  TRES_BIEN: 'bg-emerald-100 text-emerald-800',
  BIEN: 'bg-sky-100 text-sky-800',
  ASSEZ_BIEN: 'bg-indigo-100 text-indigo-800',
  PASSABLE: 'bg-amber-100 text-amber-800',
  INSUFFISANT: 'bg-red-100 text-red-800',
};

/**
 * Notes & évaluations — vue transversale de l'établissement.
 *
 * Les écrans existants sont pilotés par la classe (`/classes/[id]/grades`,
 * `/grade-book`, `/bulletins`) : il faut déjà savoir où l'on va. Cette page
 * part de l'inverse — on choisit classe, matière et période, et on lit le
 * carnet. Elle ne duplique aucune saisie : elle renvoie vers les écrans qui
 * détiennent déjà l'écriture.
 */
export default async function GradesOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ year?: string; class?: string; subject?: string; period?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  await requireRoleCode(['tenant_admin', 'direction', 'scolarite']);
  const session = (await auth())!;
  const t = await getTranslations('admin.gradesOverview');
  const tMention = await getTranslations('admin.bulletin.mentions');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    // Toutes les années, pas seulement l'active : les notes d'un exercice
    // clos restent consultables. On ouvre sur l'année active par défaut.
    const years = await tx.academicYear.findMany({
      orderBy: { startDate: 'desc' },
      select: {
        active: true,
        id: true,
        label: true,
        // pickPeriodId choisit la période courante d'après les dates : elles
        // doivent donc être remontées, pas seulement le libellé.
        periods: {
          orderBy: { startDate: 'asc' },
          select: { id: true, label: true, startDate: true, endDate: true },
        },
      },
    });
    const year = years.find((y) => y.id === sp.year) ?? years.find((y) => y.active) ?? years[0];
    if (!year) return null;

    const classes = await tx.class.findMany({
      where: { academicYearId: year.id, deletedAt: null },
      select: {
        id: true,
        name: true,
        nameAr: true,
        levelId: true,
        trackId: true,
        level: { select: { order: true } },
      },
      orderBy: [{ level: { order: 'asc' } }, { name: 'asc' }],
    });
    if (classes.length === 0) return { year, years, classes: [], cls: null };

    const cls = classes.find((c) => c.id === sp.class) ?? classes[0]!;

    // Matières de la classe : la filière au lycée, le programme du niveau
    // ailleurs — même cascade que partout dans le produit.
    const program = cls.trackId
      ? await tx.trackSubjectCoefficient.findMany({
          where: { trackId: cls.trackId },
          select: { subject: { select: { id: true, label: true, labelAr: true } } },
          orderBy: { subject: { label: 'asc' } },
        })
      : await tx.curriculumSubject.findMany({
          where: { levelId: cls.levelId },
          select: { subject: { select: { id: true, label: true, labelAr: true } } },
          orderBy: [{ order: 'asc' }, { subject: { label: 'asc' } }],
        });
    const subjects = program.map((x) => ({
      id: x.subject.id,
      label: localizedLabel(locale, x.subject.label, x.subject.labelAr),
    }));
    const subject = subjects.find((x) => x.id === sp.subject) ?? subjects[0] ?? null;

    const periodId = pickPeriodId(year.periods, sp.period);
    if (!periodId) return { year, years, classes, cls, subjects, subject, periodId: null };

    const students = await tx.studentClass.findMany({
      where: { classId: cls.id, unenrolledAt: null },
      select: {
        student: {
          select: { id: true, firstName: true, lastName: true, firstNameAr: true, lastNameAr: true },
        },
      },
      orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
    });

    // Devoirs de la matière choisie, avec les notes.
    const evaluations = subject
      ? await tx.evaluation.findMany({
          where: { classId: cls.id, periodId, subjectId: subject.id },
          select: {
            id: true,
            label: true,
            date: true,
            weight: true,
            maxValue: true,
            optional: true,
            grades: { select: { studentId: true, value: true } },
          },
          orderBy: { date: 'asc' },
        })
      : [];

    // Bilan de la classe : sert aux cartes du bas (moyenne, réussite,
    // matières en difficulté). On réutilise le moteur des bulletins pour que
    // les chiffres soient les mêmes partout.
    const allSubjects = await tx.subject.findMany({
      select: { id: true, label: true, labelAr: true, coefficient: true, scale: true, order: true },
      orderBy: [{ order: 'asc' }, { label: 'asc' }],
    });
    const book = await computeClassBook(tx, {
      classId: cls.id,
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

    return { year, years, classes, cls, subjects, subject, periodId, students, evaluations, book };
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
  if (!data.cls) {
    return (
      <div className="px-3 py-3">
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
          {t('noClass')}
        </p>
      </div>
    );
  }

  const { year, years, classes, cls, subjects = [], subject, periodId, students = [], evaluations = [], book } = data;

  /* ── Carnet : une ligne par élève, une colonne par devoir ─────────────── */
  const gradeOf = new Map<string, number | null>();
  for (const e of evaluations)
    for (const g of e.grades) gradeOf.set(`${e.id}|${g.studentId}`, g.value);

  const rows = students.map((s) => {
    const cells = evaluations.map((e) => gradeOf.get(`${e.id}|${s.student.id}`) ?? null);
    // Moyenne pondérée, ramenée sur 20 : les barèmes peuvent différer d'un
    // devoir à l'autre, les additionner bruts n'aurait pas de sens.
    let num = 0;
    let den = 0;
    cells.forEach((v, i) => {
      if (v === null) return;
      const e = evaluations[i]!;
      num += (v / e.maxValue) * 20 * e.weight;
      den += e.weight;
    });
    const average = den > 0 ? Math.round((num / den) * 10) / 10 : null;
    return { student: s.student, cells, average };
  });

  const columnAverages = evaluations.map((e, i) => {
    const vals = rows.map((r) => r.cells[i]).filter((v): v is number => v !== null);
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  });
  const rated = rows.map((r) => r.average).filter((v): v is number => v !== null);
  const classAverage = rated.length
    ? Math.round((rated.reduce((a, b) => a + b, 0) / rated.length) * 10) / 10
    : null;
  const passed = rated.filter((v) => v >= 10).length;
  const successPct = rated.length ? Math.round((passed / rated.length) * 100) : 0;

  /** Répartition des moyennes, comme la maquette. */
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

  /** Dernier devoir saisi : « Évaluation en cours » du panneau. */
  const current = evaluations.length ? evaluations[evaluations.length - 1]! : null;
  const currentFilled = current
    ? Math.round(
        (current.grades.filter((g) => g.value !== null).length / Math.max(1, students.length)) * 100,
      )
    : 0;

  /** Matières en difficulté : les plus basses moyennes de la classe. */
  const weakest = book
    ? [...book.classSubjectAverages.entries()]
        .filter((e): e is [string, number] => e[1] !== null)
        .map(([sid, avg]) => ({
          label: subjects.find((s) => s.id === sid)?.label ?? sid,
          avg,
        }))
        .sort((a, b) => a.avg - b.avg)
        .slice(0, 5)
    : [];

  const base = `/${locale}/admin/grades`;

  return (
    <div className="px-3 py-3">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <div>
          <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-slate-600">
            {t('subtitle')} · {year.label}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/${locale}/admin/classes/${cls.id}/grades`}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            {t('enterGrades')}
          </Link>
          <Link
            href={`/${locale}/admin/classes/${cls.id}/bulletins`}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            {t('printReports')}
          </Link>
        </div>
      </header>

      <GradeFilters
        base={base}
        years={years.map((y) => ({ id: y.id, label: y.label }))}
        classes={classes.map((c) => ({ id: c.id, label: localizedLabel(locale, c.name, c.nameAr) }))}
        subjects={subjects}
        periods={year.periods}
        selected={{
          yearId: year.id,
          classId: cls.id,
          subjectId: subject?.id ?? '',
          periodId: periodId ?? '',
        }}
      />

      <div className="mt-4 flex flex-col gap-4 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1 space-y-4">
          {/* Carnet de notes */}
          <section className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-800">
                {t('book')} {subject ? `— ${subject.label}` : ''}
              </h2>
              <span className="text-xs text-slate-500">
                {t('evalCount', { count: evaluations.length })}
              </span>
            </div>
            {evaluations.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-400">{t('noEval')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
                    <tr>
                      <th className="px-3 py-3 text-start">#</th>
                      <th className="px-3 py-3 text-start">{t('student')}</th>
                      {evaluations.map((e) => (
                        <th key={e.id} className="px-3 py-3 text-center">
                          <div>{e.label}</div>
                          <div className="text-[10px] font-normal normal-case text-slate-400">
                            {e.date.toLocaleDateString(locale, { day: '2-digit', month: 'short' })}
                          </div>
                        </th>
                      ))}
                      <th className="px-3 py-3 text-center">{t('average')}</th>
                      <th className="px-3 py-3 text-center">{t('mention')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r, i) => {
                      const m = computeMention(r.average);
                      return (
                        <tr key={r.student.id}>
                          <td className="px-3 py-2 text-xs text-slate-400">{i + 1}</td>
                          <td className="px-3 py-2 font-medium text-slate-800">
                            {personDisplayName(locale, r.student)}
                          </td>
                          {r.cells.map((v, k) => (
                            <td
                              key={k}
                              className={`px-3 py-2 text-center tabular-nums ${
                                v === null ? 'text-slate-300' : 'text-slate-700'
                              }`}
                            >
                              {v === null ? '—' : v.toFixed(1)}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-center font-semibold tabular-nums text-slate-900">
                            {r.average === null ? '—' : r.average.toFixed(1)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {m && (
                              <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${MENTION_TONE[m]}`}
                              >
                                {tMention(m as never)}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="bg-slate-50 font-semibold">
                      <td className="px-3 py-2" />
                      <td className="px-3 py-2 text-slate-700">{t('classAverage')}</td>
                      {columnAverages.map((v, k) => (
                        <td key={k} className="px-3 py-2 text-center tabular-nums text-slate-700">
                          {v === null ? '—' : v.toFixed(1)}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-center tabular-nums text-slate-900">
                        {classAverage === null ? '—' : `${classAverage.toFixed(1)} /20`}
                      </td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Cartes de synthèse */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
        </div>

        {/* Colonne de droite */}
        <aside className="w-full shrink-0 space-y-4 xl:w-[320px]">
          <section className="rounded-2xl border border-brand-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-800">{t('currentEval')}</h2>
            {!current ? (
              <p className="mt-2 text-xs text-slate-400">{t('noEval')}</p>
            ) : (
              <>
                <p className="mt-2 text-sm font-medium text-slate-900">{current.label}</p>
                <dl className="mt-3 space-y-2 text-xs">
                  <Row label={t('date')} value={current.date.toLocaleDateString(locale)} />
                  <Row label={t('weight')} value={String(current.weight)} />
                  <Row label={t('scale')} value={`/${current.maxValue}`} />
                  <Row
                    label={t('optional')}
                    value={current.optional ? t('yes') : t('no')}
                  />
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
              {t('ratedOf', { rated: rated.length, total: students.length })}
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
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
