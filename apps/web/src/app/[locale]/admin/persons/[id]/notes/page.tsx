import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { requireRoleCode } from '@/lib/auth/rbac';
import { withTenant } from '@/lib/db';
import { computeClassBook } from '@/lib/grades';
import { pickPeriodId } from '@/lib/periods';
import { localizedLabel, personDisplayName } from '@/lib/localized-name';
import { PersonHeader, PERSON_PAGE_SHELL } from '../person-header';
import { PeriodTabs } from '../period-tabs';
import { KpiCard } from '@/components/kpi-card';
import { resolveStudentSchooling } from '../schooling';

/**
 * Notes & évaluations d'un élève, matière par matière.
 *
 * Répond aux questions qu'on pose devant un bulletin : où en est l'élève,
 * comment se situe-t-il face à sa classe, et sur quelles notes repose la
 * moyenne. La saisie reste dans la classe — ici on lit.
 *
 * Les quatre mesures de tête et le tableau sortent tous du **même** carnet de
 * classe : moyenne, rang et moyenne de classe calculés séparément finiraient
 * par se contredire d'un écran à l'autre.
 */
export default async function StudentNotesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { locale, id } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  await requireRoleCode(['tenant_admin', 'direction', 'scolarite', 'cpe']);
  const session = (await auth())!;
  const t = await getTranslations('admin.studentNotes');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const student = await tx.person.findFirst({
      where: { id, type: 'STUDENT' },
      select: { id: true },
    });
    if (!student) return null;

    const schooling = await resolveStudentSchooling(tx, id);
    if (!schooling) return { cls: null as null };

    const { class: cls, periods, year, fallback } = schooling;
    const periodId = pickPeriodId(periods, sp.period);
    if (!periodId) return { cls, periods, periodId: null, year, fallback };

    const allSubjects = await tx.subject.findMany({
      select: { id: true, label: true, labelAr: true, coefficient: true, scale: true, order: true },
      orderBy: [{ order: 'asc' }, { label: 'asc' }],
    });

    const [book, grades, appreciations, assignments] = await Promise.all([
      computeClassBook(tx, {
        classId: cls.id,
        periodId,
        students: cls.students.map((s) => s.student),
        allSubjects: allSubjects.map((s) => ({
          id: s.id,
          label: localizedLabel(locale, s.label, s.labelAr),
          coefficient: s.coefficient,
          scale: s.scale,
          order: s.order,
        })),
      }),
      tx.grade.findMany({
        where: { studentId: id, value: { not: null }, evaluation: { periodId, classId: cls.id } },
        select: {
          value: true,
          evaluation: {
            select: {
              id: true,
              label: true,
              date: true,
              weight: true,
              maxValue: true,
              subjectId: true,
            },
          },
        },
        orderBy: { evaluation: { date: 'desc' } },
      }),
      tx.subjectAppreciation.findMany({
        where: { studentId: id, periodId },
        select: { subjectId: true, text: true },
      }),
      tx.teacherAssignment.findMany({
        where: { classId: cls.id, academicYearId: cls.academicYearId },
        select: {
          subjectId: true,
          teacher: {
            select: { firstName: true, lastName: true, firstNameAr: true, lastNameAr: true },
          },
        },
      }),
    ]);

    return { cls, periods, periodId, book, grades, appreciations, assignments, year, fallback };
  });

  if (!data) notFound();

  const shell = (children: React.ReactNode) => (
    <div className={PERSON_PAGE_SHELL}>
      <PersonHeader personId={id} locale={locale} active="notes" />
      {children}
    </div>
  );

  if (!data.cls) {
    return shell(
      <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        {t('noClass')}
      </p>,
    );
  }
  if (!data.periodId) {
    return shell(
      <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        {t('noPeriod')}
      </p>,
    );
  }

  const { cls, periods, periodId, book, grades, appreciations, assignments } = data;

  const mine = book.rows.find((r) => r.studentId === id) ?? null;
  const teacherOf = new Map(
    assignments.map((a) => [a.subjectId, personDisplayName(locale, a.teacher)]),
  );
  const appreciationOf = new Map(appreciations.map((a) => [a.subjectId, a.text]));
  const gradesOf = new Map<string, typeof grades>();
  for (const g of grades) {
    const arr = gradesOf.get(g.evaluation.subjectId) ?? [];
    arr.push(g);
    gradesOf.set(g.evaluation.subjectId, arr);
  }

  // Seules les matières où l'élève a une note : lister tout le programme
  // remplirait le tableau de lignes vides sans rien apprendre.
  const subjects = (mine?.subjects ?? []).filter((s) => s.gradeCount > 0);
  const periodLabel = periods.find((p) => p.id === periodId)?.label ?? '';
  const nf = (v: number | null, digits = 1) =>
    v === null ? '—' : v.toFixed(digits).replace('.', ',');

  return shell(
    <>
      {/* L'année affichée n'est pas toujours l'année active : quand celle-ci
          n'a pas encore de trimestre, on montre le dernier exercice
          exploitable plutôt qu'un écran vide — mais on le dit. */}
      {data.fallback && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
          {t('fallbackYear', { year: data.year.label })}
        </p>
      )}

      <PeriodTabs periods={periods} current={periodId} />

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon="📊"
          tone="sky"
          label={t('kpi.average', { period: periodLabel })}
          value={`${nf(mine?.generalAverage ?? null)} /20`}
          valueTone={
            mine?.generalAverage == null
              ? 'text-slate-400'
              : mine.generalAverage >= 12
                ? 'text-emerald-700'
                : mine.generalAverage >= 10
                  ? 'text-slate-900'
                  : 'text-red-700'
          }
        />
        <KpiCard
          icon="🏫"
          tone="violet"
          label={t('kpi.classAverage')}
          value={`${nf(book.classGeneralAverage)} /20`}
        />
        <KpiCard
          icon="🏅"
          tone="emerald"
          label={t('kpi.rank')}
          value={mine?.generalRank ? `${mine.generalRank} / ${mine.ratedStudents}` : null}
        />
        <KpiCard
          icon="📝"
          tone="slate"
          label={t('kpi.gradeCount')}
          value={t('kpi.grades', { count: grades.length })}
        />
      </div>

      <h2 className="mb-3 mt-6 text-base font-semibold text-slate-900">
        {t('tableTitle', {
          class: localizedLabel(locale, cls.name, cls.nameAr),
          period: periodLabel,
        })}
      </h2>

      <div className="overflow-x-auto rounded-2xl border border-brand-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
            <tr>
              <th className="px-4 py-3 text-start">{t('table.subject')}</th>
              <th className="px-4 py-3 text-end">{t('table.coefficient')}</th>
              <th className="px-4 py-3 text-start">{t('table.grades')}</th>
              <th className="px-4 py-3 text-end">{t('table.studentAverage')}</th>
              <th className="px-4 py-3 text-end">{t('table.classAverage')}</th>
              <th className="px-4 py-3 text-start">{t('table.appreciation')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {subjects.map((s) => {
              const classAvg = book.classSubjectAverages.get(s.subjectId) ?? null;
              const above = s.average !== null && classAvg !== null && s.average >= classAvg;
              return (
                <tr key={s.subjectId}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{s.subjectLabel}</div>
                    <div className="text-[11px] text-slate-500">
                      {teacherOf.get(s.subjectId) ?? t('noTeacher')}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums text-slate-600">
                    {s.subjectCoefficient}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {(gradesOf.get(s.subjectId) ?? []).map((g) => (
                        <span
                          key={g.evaluation.id}
                          title={`${g.evaluation.label} — ${g.evaluation.date.toLocaleDateString(locale)}`}
                          className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-800"
                        >
                          {nf(Number(g.value))}/{g.evaluation.maxValue}
                          {/* Le poids n'apparaît que s'il change quelque chose :
                              « ×1 » sur chaque note serait du bruit. */}
                          {g.evaluation.weight !== 1 && (
                            <span className="ms-1 font-normal text-slate-500">
                              ×{g.evaluation.weight}
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td
                    className={`px-4 py-3 text-end font-semibold tabular-nums ${
                      above ? 'text-emerald-700' : 'text-slate-900'
                    }`}
                  >
                    {nf(s.average)} /{s.subjectScale}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums text-slate-600">
                    {nf(classAvg)} /{s.subjectScale}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {appreciationOf.get(s.subjectId) ?? '—'}
                  </td>
                </tr>
              );
            })}
            {subjects.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                  {t('empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>,
  );
}

