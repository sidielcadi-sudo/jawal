import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getTeacherPersonId, teacherTeachesClassSubject } from '@/lib/teacher';
import { TeacherEvaluationForm, TeacherEvalRowActions } from './client';

export default async function TeacherSubjectGradesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; classId: string; subjectId: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { locale, classId, subjectId } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('enseignant.grades');
  const session = (await auth())!;

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const teacherId = await getTeacherPersonId(tx, session.user.id);
    if (!teacherId) return null;
    if (!(await teacherTeachesClassSubject(tx, teacherId, classId, subjectId))) return null;

    const cls = await tx.class.findUnique({
      where: { id: classId },
      include: {
        academicYear: { include: { periods: { orderBy: { startDate: 'asc' } } } },
        level: { include: { cycle: true } },
        students: { where: { unenrolledAt: null }, select: { studentId: true } },
      },
    });
    if (!cls) return null;
    const subject = await tx.subject.findUnique({ where: { id: subjectId } });
    if (!subject) return null;

    const evaluations = await tx.evaluation.findMany({
      where: { classId, subjectId, ...(sp.period ? { periodId: sp.period } : {}) },
      orderBy: { date: 'desc' },
      include: {
        period: true,
        _count: { select: { grades: { where: { value: { not: null } } } } },
      },
    });

    return { cls, subject, periods: cls.academicYear.periods, evaluations };
  });

  if (!data) notFound();
  const { cls, subject, periods, evaluations } = data;
  const base = `/${locale}/enseignant/classes`;
  const gradesBase = `${base}/${classId}/grades/${subjectId}`;
  const total = cls.students.length;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <nav className="mb-4 text-xs text-slate-500">
        <Link href={base} className="hover:text-brand-700">
          {t('myClasses')}
        </Link>
        <span className="mx-1.5">›</span>
        <span>
          {cls.name} · {subject.label}
        </span>
      </nav>

      <header className="mb-6">
        <h1 className="mb-4 -mx-6 overflow-hidden rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-3 text-2xl font-semibold text-slate-900">
          {t('title')} — {cls.name}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {cls.level.cycle.label} · {cls.level.label} · {subject.label} · {cls.academicYear.label}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <form method="get" className="mb-3 flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-slate-600">{t('filter.period')}</label>
              <select
                name="period"
                defaultValue={sp.period ?? ''}
                className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm shadow-sm"
              >
                <option value="">{t('filter.allPeriods')}</option>
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
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
                  <th className="px-4 py-3 text-start">{t('table.period')}</th>
                  <th className="px-4 py-3 text-start">{t('table.date')}</th>
                  <th className="px-4 py-3 text-end">{t('table.filled')}</th>
                  <th className="px-4 py-3 text-end">{t('table.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {evaluations.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-3">
                      <Link
                        href={`${gradesBase}/${e.id}`}
                        className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                      >
                        {e.label}
                      </Link>
                      <div className="text-xs text-slate-500">
                        /{e.maxValue} · ×{e.weight}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{e.period.label}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {new Date(e.date).toLocaleDateString(locale)}
                    </td>
                    <td className="px-4 py-3 text-end text-xs tabular-nums">
                      <span
                        className={e._count.grades === total ? 'text-emerald-700' : 'text-amber-700'}
                      >
                        {e._count.grades}/{total}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-end">
                      <TeacherEvalRowActions
                        evaluationId={e.id}
                        classId={classId}
                        subjectId={subjectId}
                        sheetHref={`${gradesBase}/${e.id}`}
                      />
                    </td>
                  </tr>
                ))}
                {evaluations.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
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
            <p className="mt-1 text-xs text-slate-500">{t('createHint')}</p>
            <div className="mt-4">
              <TeacherEvaluationForm
                classId={classId}
                subjectId={subjectId}
                subjectLabel={subject.label}
                periods={periods.map((p) => ({ id: p.id, label: p.label }))}
                defaultMax={subject.scale}
                basePath={gradesBase}
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
