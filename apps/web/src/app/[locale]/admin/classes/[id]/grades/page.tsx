import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { EvaluationCreateForm, EvaluationRowActions } from './client';
import { localizedLabel } from '@/lib/localized-name';
import { PeriodButtons } from '@/components/period-buttons';
import { ClassHeader, CLASS_PAGE_SHELL } from '../class-header';

export default async function ClassGradesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ subject?: string; period?: string }>;
}) {
  const tCrumb = await getTranslations('admin.classes.detail');
  const { locale, id } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('admin.grades');

  const session = (await auth())!;
  const tenantId = session.user.tenantId;

  const { cls, subjects, periods, evaluations } = await withTenant(tenantId, async (tx) => {
    const cls = await tx.class.findUnique({
      where: { id },
      include: {
        academicYear: { include: { periods: { orderBy: { startDate: 'asc' } } } },
        level: { include: { cycle: true } },
        students: { where: { unenrolledAt: null } },
      },
    });
    if (!cls) return { cls: null, subjects: [], periods: [], evaluations: [] };

    // Matières de CETTE classe : programme de son niveau, affectations et
    // emploi du temps. La liste complète de l'établissement proposait des
    // matières que la classe n'a pas.
    const [curriculum, assigned, scheduled] = await Promise.all([
      tx.curriculumSubject.findMany({ where: { levelId: cls.levelId }, select: { subjectId: true } }),
      tx.teacherAssignment.findMany({ where: { classId: id }, select: { subjectId: true } }),
      tx.timetableEntry.findMany({ where: { classId: id }, select: { subjectId: true } }),
    ]);
    const subjectIds = [
      ...new Set(
        [...curriculum, ...assigned, ...scheduled]
          .map((x) => x.subjectId)
          .filter((x): x is string => Boolean(x)),
      ),
    ];
    const subjects = await tx.subject.findMany({
      where: { id: { in: subjectIds } },
      orderBy: [{ order: 'asc' }, { label: 'asc' }],
    });

    // Sessions d'examen de l'année : une période de session ne concerne que
    // le niveau de sa session (pas de « Évaluation diagnostique 2AC » sur une
    // classe de 1AC).
    const sessions = await tx.examSession.findMany({
      where: { academicYearId: cls.academicYearId },
      select: { periodId: true, levelId: true },
    });
    const sessionLevels = new Map<string, Set<string>>();
    for (const s of sessions) {
      if (!s.periodId) continue;
      const set = sessionLevels.get(s.periodId) ?? new Set<string>();
      set.add(s.levelId);
      sessionLevels.set(s.periodId, set);
    }
    const periods = cls.academicYear.periods.filter(
      (p) => p.kind !== 'SESSION' || sessionLevels.get(p.id)?.has(cls.levelId),
    );

    const evaluations = await tx.evaluation.findMany({
      where: {
        classId: id,
        ...(sp.subject ? { subjectId: sp.subject } : {}),
        ...(sp.period ? { periodId: sp.period } : {}),
      },
      orderBy: { date: 'desc' },
      include: {
        subject: true,
        period: true,
        _count: { select: { grades: { where: { value: { not: null } } } } },
      },
    });

    return { cls, subjects, periods, evaluations };
  });

  if (!cls) notFound();

  const baseHref = `/${locale}/admin/classes/${id}/grades`;
  // Période d'une session d'examen (évaluation diagnostique…) : ses devoirs
  // sont générés à la publication de la session, pas créés à la main.
  const sessionPeriod = periods.find((p) => p.id === sp.period && p.kind === 'SESSION') ?? null;

  return (
    <div className={CLASS_PAGE_SHELL}>
      <ClassHeader cls={cls} locale={locale} current={tCrumb('manageGrades')} />

      {subjects.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          {t('noSubjects')}{' '}
          <Link
            href={`/${locale}/admin/settings/subjects`}
            className="font-medium text-brand-700 hover:underline"
          >
            {t('goToSubjects')}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2">
            <div className="mb-3">
              <PeriodButtons
                periods={periods}
                selectedId={sp.period ?? null}
                locale={locale}
                allLabel={t('filter.allPeriods')}
              />
            </div>
            <form method="get" className="mb-3 flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-slate-600">{t('filter.subject')}</label>
                <select
                  name="subject"
                  defaultValue={sp.subject ?? ''}
                  className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm shadow-sm"
                >
                  <option value="">{t('filter.allSubjects')}</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                {t('filter.apply')}
              </button>
            </form>

            <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-start">{t('table.label')}</th>
                    <th className="px-4 py-3 text-start">{t('table.subject')}</th>
                    <th className="px-4 py-3 text-start">{t('table.period')}</th>
                    <th className="px-4 py-3 text-start">{t('table.date')}</th>
                    <th className="px-4 py-3 text-end">{t('table.filled')}</th>
                    <th className="px-4 py-3 text-end">{t('table.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {evaluations.map((e) => {
                    const filled = e._count.grades;
                    const total = cls.students.length;
                    return (
                      <tr key={e.id}>
                        <td className="px-4 py-3">
                          <Link
                            href={`${baseHref}/${e.id}`}
                            className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                          >
                            {e.label}
                          </Link>
                          <div className="text-xs text-slate-500">
                            /{e.maxValue} · ×{e.weight}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">{localizedLabel(locale, e.subject.label, e.subject.labelAr)}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">{localizedLabel(locale, e.period.label, e.period.labelAr)}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {new Date(e.date).toLocaleDateString(locale)}
                        </td>
                        <td className="px-4 py-3 text-end text-xs tabular-nums">
                          <span className={filled === total ? 'text-emerald-700' : 'text-amber-700'}>
                            {filled}/{total}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-end">
                          <EvaluationRowActions
                            evaluationId={e.id}
                            classId={id}
                            locale={locale}
                          />
                        </td>
                      </tr>
                    );
                  })}
                  {evaluations.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                        {t('empty')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <aside>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-base font-semibold text-slate-900">{t('create')}</h2>
              {sessionPeriod ? (
                <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {t('sessionLocked', { period: localizedLabel(locale, sessionPeriod.label, sessionPeriod.labelAr) })}
                </p>
              ) : (
                <>
                  <p className="mt-1 text-xs text-slate-500">{t('createHint')}</p>
                  <div className="mt-4">
                    <EvaluationCreateForm
                      classId={id}
                      subjects={subjects.map((s) => ({ id: s.id, label: s.label, scale: s.scale }))}
                      periods={periods
                        .filter((p) => p.kind !== 'SESSION')
                        .map((p) => ({ id: p.id, label: p.label, labelAr: p.labelAr }))}
                      defaultSubjectId={sp.subject}
                      defaultPeriodId={sp.period}
                    />
                  </div>
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
