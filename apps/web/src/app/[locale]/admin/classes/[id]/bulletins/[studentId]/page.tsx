import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant, prismaAdmin } from '@/lib/db';
import { computeStudentReport, computeClassBook } from '@/lib/grades';
import { PrintButton } from './print-button';

export default async function BulletinPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string; studentId: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { locale, id, studentId } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('admin.bulletin');

  const session = (await auth())!;
  const tenantId = session.user.tenantId;

  // Tenant info pour l'en-tête du bulletin (admin pour s'assurer de l'accès)
  const tenant = await prismaAdmin.tenant.findUnique({ where: { id: tenantId } });

  const data = await withTenant(tenantId, async (tx) => {
    const cls = await tx.class.findUnique({
      where: { id },
      include: {
        academicYear: { include: { periods: { orderBy: { startDate: 'asc' } } } },
        level: { include: { cycle: true } },
        students: {
          where: { unenrolledAt: null },
          include: { student: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });
    if (!cls) return null;

    const student = await tx.person.findUnique({ where: { id: studentId } });
    if (!student || student.type !== 'STUDENT') return null;

    const enrollment = cls.students.find((sc) => sc.studentId === studentId);
    if (!enrollment) return null;

    const subjects = await tx.subject.findMany({
      orderBy: [{ order: 'asc' }, { label: 'asc' }],
    });

    const selectedPeriodId = sp.period ?? cls.academicYear.periods[0]?.id;
    if (!selectedPeriodId) return { cls, student, subjects, periods: cls.academicYear.periods, selectedPeriodId: null, report: null, classBook: null };

    const period = cls.academicYear.periods.find((p) => p.id === selectedPeriodId);

    const allSubjects = subjects.map((s) => ({
      id: s.id,
      label: s.label,
      scale: s.scale,
      coefficient: s.coefficient,
      order: s.order,
    }));

    const report = await computeStudentReport(tx, {
      classId: id,
      periodId: selectedPeriodId,
      studentId,
      allSubjects,
    });

    const classBook = await computeClassBook(tx, {
      classId: id,
      periodId: selectedPeriodId,
      students: cls.students.map((sc) => ({
        id: sc.student.id,
        firstName: sc.student.firstName,
        lastName: sc.student.lastName,
      })),
      allSubjects,
    });

    return {
      cls,
      student,
      subjects,
      periods: cls.academicYear.periods,
      selectedPeriodId,
      period,
      report,
      classBook,
    };
  });

  if (!data) notFound();
  const { cls, student, periods, selectedPeriodId, period, report, classBook } = data;

  return (
    <>
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 print:hidden">
        <nav className="mb-3 text-xs text-slate-500">
          <Link href={`/${locale}/admin/classes`} className="hover:text-brand-700">
            {t('classes')}
          </Link>
          <span className="mx-1.5">›</span>
          <Link href={`/${locale}/admin/classes/${id}`} className="hover:text-brand-700">
            {cls.name}
          </Link>
          <span className="mx-1.5">›</span>
          <span>{t('title')}</span>
        </nav>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <form method="get" className="flex items-end gap-2">
            <div>
              <label className="block text-xs text-slate-600">{t('filter.period')}</label>
              <select
                name="period"
                defaultValue={selectedPeriodId ?? ''}
                className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm shadow-sm"
              >
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
          <PrintButton label={t('print')} />
        </div>
      </div>

      {/* Le bulletin lui-même — visible à l'écran et à l'impression */}
      <article className="mx-auto max-w-4xl bg-white px-6 py-8 print:max-w-none print:px-10 print:py-6" id="bulletin">
        <header className="border-b border-slate-300 pb-4">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="text-xl font-bold uppercase text-slate-900">{tenant?.name}</div>
              <div className="mt-1 text-xs text-slate-600">{tenant?.timezone}</div>
            </div>
            <div className="text-end text-xs text-slate-500">
              <div>{tenant?.currency}</div>
              <div className="font-mono">{cls.academicYear.label}</div>
            </div>
          </div>
          <h1 className="mt-4 text-center text-xl font-bold uppercase tracking-wide text-slate-900">
            {t('bulletinOf', { period: period?.label ?? '—', year: cls.academicYear.label })}
          </h1>
        </header>

        <section className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 border-b border-slate-300 pb-4 text-sm">
          <div>
            <span className="text-slate-500">{t('info.student')} :</span>{' '}
            <span className="font-semibold">{student.lastName} {student.firstName}</span>
          </div>
          <div>
            <span className="text-slate-500">{t('info.class')} :</span>{' '}
            <span className="font-semibold">{cls.name}</span>
          </div>
          {student.birthDate && (
            <div>
              <span className="text-slate-500">{t('info.bornOn')} :</span>{' '}
              {new Date(student.birthDate).toLocaleDateString(locale)}
            </div>
          )}
          <div>
            <span className="text-slate-500">{t('info.level')} :</span>{' '}
            {cls.level.cycle.label} — {cls.level.label}
          </div>
          {report && (
            <div>
              <span className="text-slate-500">{t('info.classSize')} :</span>{' '}
              {classBook?.rows.length ?? cls.students.length}
            </div>
          )}
          <div>
            <span className="text-slate-500">{t('info.printedOn')} :</span>{' '}
            {new Date().toLocaleDateString(locale)}
          </div>
        </section>

        {report && classBook && (
          <>
            <table className="mt-4 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-slate-700 bg-slate-100 text-xs uppercase">
                  <th className="px-2 py-2 text-start">{t('table.subject')}</th>
                  <th className="px-2 py-2 text-center">{t('table.coefficient')}</th>
                  <th className="px-2 py-2 text-center">{t('table.gradesCount')}</th>
                  <th className="px-2 py-2 text-center">{t('table.studentAvg')}</th>
                  <th className="px-2 py-2 text-center">{t('table.classAvg')}</th>
                </tr>
              </thead>
              <tbody>
                {report.subjects.map((s) => {
                  const classAvg = classBook.classSubjectAverages.get(s.subjectId);
                  return (
                    <tr key={s.subjectId} className="border-b border-slate-200">
                      <td className="px-2 py-1.5">
                        <span className="font-medium">{s.subjectLabel}</span>
                        <span className="ms-1 text-xs text-slate-500">/{s.subjectScale}</span>
                      </td>
                      <td className="px-2 py-1.5 text-center tabular-nums">{s.subjectCoefficient}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums text-slate-500">
                        {s.gradeCount}
                      </td>
                      <td className="px-2 py-1.5 text-center font-semibold tabular-nums">
                        {s.average === null ? '—' : s.average.toFixed(2)}
                      </td>
                      <td className="px-2 py-1.5 text-center tabular-nums text-slate-500">
                        {classAvg === null || classAvg === undefined ? '—' : classAvg.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-700 bg-slate-100">
                  <td colSpan={3} className="px-2 py-3 text-end font-bold uppercase">
                    {t('table.generalAvg')}
                  </td>
                  <td className="px-2 py-3 text-center text-lg font-bold tabular-nums">
                    {report.generalAverage === null ? '—' : report.generalAverage.toFixed(2)}
                  </td>
                  <td className="px-2 py-3 text-center tabular-nums text-slate-700">
                    {classBook.classGeneralAverage === null
                      ? '—'
                      : classBook.classGeneralAverage.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>

            <section className="mt-6 grid grid-cols-2 gap-6 text-xs text-slate-600">
              <div className="border border-slate-300 p-3">
                <div className="text-[10px] uppercase text-slate-500">{t('signatures.head')}</div>
                <div className="h-16" />
              </div>
              <div className="border border-slate-300 p-3">
                <div className="text-[10px] uppercase text-slate-500">{t('signatures.parent')}</div>
                <div className="h-16" />
              </div>
            </section>

            <footer className="mt-6 border-t border-slate-200 pt-2 text-center text-[10px] text-slate-400">
              {t('footer', { id: report.studentId.slice(0, 8) })}
            </footer>
          </>
        )}
      </article>
    </>
  );
}
