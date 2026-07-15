import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant, prismaAdmin } from '@/lib/db';
import { computeStudentReport, computeClassBook, computeMention } from '@/lib/grades';
import { PrintButton } from './print-button';
import { AppreciationEditor, CouncilEditor } from './editors';
import { pickPeriodId } from '@/lib/periods';

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
        mainTeacher: true,
      },
    });
    if (!cls) return null;

    const student = await tx.person.findUnique({ where: { id: studentId } });
    if (!student || student.type !== 'STUDENT') return null;
    if (!cls.students.find((sc) => sc.studentId === studentId)) return null;

    const subjects = await tx.subject.findMany({
      orderBy: [{ order: 'asc' }, { label: 'asc' }],
    });

    const selectedPeriodId = pickPeriodId(cls.academicYear.periods, sp.period) ?? undefined;
    if (!selectedPeriodId) {
      return {
        cls,
        student,
        subjects,
        periods: cls.academicYear.periods,
        selectedPeriodId: null,
        period: null,
        report: null,
        classBook: null,
        subjectApprecs: [],
        council: null,
      };
    }
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

    const subjectApprecs = await tx.subjectAppreciation.findMany({
      where: { studentId, periodId: selectedPeriodId },
    });

    const council = await tx.councilEntry.findUnique({
      where: {
        classId_periodId_studentId: { classId: id, periodId: selectedPeriodId, studentId },
      },
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
      subjectApprecs,
      council,
    };
  });

  if (!data) notFound();
  const { cls, student, periods, selectedPeriodId, period, report, classBook, subjectApprecs, council } = data;

  const apprecByS = new Map(subjectApprecs.map((a) => [a.subjectId, a.text]));
  const studentRow = classBook?.rows.find((r) => r.studentId === studentId);

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
          <div className="flex flex-wrap items-end gap-2">
            {selectedPeriodId && (
              <>
                <a
                  href={`/api/admin/classes/${id}/bulletin.pdf?studentId=${studentId}&period=${selectedPeriodId}`}
                  className="rounded-lg border border-brand-600 bg-white px-4 py-2 text-sm font-medium text-brand-700 shadow-sm hover:bg-brand-50"
                >
                  ⬇ {t('downloadPdf')}
                </a>
                <a
                  href={`/api/admin/classes/${id}/bulletins.pdf?period=${selectedPeriodId}`}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  ⬇ {t('downloadClassPdf')}
                </a>
              </>
            )}
            <PrintButton label={t('print')} />
          </div>
        </div>
      </div>

      <article
        className="mx-auto max-w-4xl bg-white px-6 py-8 print:max-w-none print:px-10 print:py-6"
        id="bulletin"
      >
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
            <span className="font-semibold">
              {student.lastName} {student.firstName}
            </span>
          </div>
          <div>
            <span className="text-slate-500">{t('info.class')} :</span>{' '}
            <span className="font-semibold">{cls.name}</span>
            {cls.mainTeacher && (
              <span className="ms-2 text-xs text-slate-500">
                · {t('info.mainTeacher')} : {cls.mainTeacher.lastName} {cls.mainTeacher.firstName}
              </span>
            )}
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
          <div>
            <span className="text-slate-500">{t('info.classSize')} :</span>{' '}
            {classBook?.rows.length ?? cls.students.length}
          </div>
          <div>
            <span className="text-slate-500">{t('info.printedOn')} :</span>{' '}
            {new Date().toLocaleDateString(locale)}
          </div>
        </section>

        {report && classBook && studentRow && (
          <>
            <table className="mt-4 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-slate-700 bg-slate-100 text-xs uppercase">
                  <th className="px-2 py-2 text-start">{t('table.subject')}</th>
                  <th className="px-2 py-2 text-center">{t('table.coefficient')}</th>
                  <th className="px-2 py-2 text-center">{t('table.studentAvg')}</th>
                  <th className="px-2 py-2 text-center">{t('table.classAvg')}</th>
                  <th className="px-2 py-2 text-center">{t('table.rank')}</th>
                  <th className="px-2 py-2 text-center">{t('table.mention')}</th>
                  <th className="px-2 py-2 text-start">{t('table.appreciation')}</th>
                </tr>
              </thead>
              <tbody>
                {studentRow.subjects.map((s) => {
                  const classAvg = classBook.classSubjectAverages.get(s.subjectId);
                  const mention = computeMention(s.average, s.subjectScale);
                  const text = apprecByS.get(s.subjectId) ?? '';
                  return (
                    <tr key={s.subjectId} className="border-b border-slate-200 align-top">
                      <td className="px-2 py-1.5">
                        <span className="font-medium">{s.subjectLabel}</span>
                        <span className="ms-1 text-xs text-slate-500">/{s.subjectScale}</span>
                      </td>
                      <td className="px-2 py-1.5 text-center tabular-nums">{s.subjectCoefficient}</td>
                      <td className="px-2 py-1.5 text-center font-semibold tabular-nums">
                        {s.average === null ? '—' : s.average.toFixed(2)}
                      </td>
                      <td className="px-2 py-1.5 text-center tabular-nums text-slate-500">
                        {classAvg === null || classAvg === undefined ? '—' : classAvg.toFixed(2)}
                      </td>
                      <td className="px-2 py-1.5 text-center tabular-nums text-slate-700">
                        {s.rank ? `${s.rank}` : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-center text-[10px]">
                        {mention && (
                          <span className={mentionClasses(mention)}>{t(`mentions.${mention}` as never)}</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-xs">
                        {/* Texte visible à l'impression */}
                        <div className="hidden print:block">
                          {text || <span className="text-slate-300">—</span>}
                        </div>
                        <div className="print:hidden">
                          <AppreciationEditor
                            studentId={studentId}
                            subjectId={s.subjectId}
                            periodId={selectedPeriodId!}
                            initialText={text}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-700 bg-slate-100">
                  <td colSpan={2} className="px-2 py-3 text-end font-bold uppercase">
                    {t('table.generalAvg')}
                  </td>
                  <td className="px-2 py-3 text-center text-lg font-bold tabular-nums">
                    {report.generalAverage === null ? '—' : report.generalAverage.toFixed(2)}
                  </td>
                  <td className="px-2 py-3 text-center tabular-nums text-slate-700">
                    {classBook.classGeneralAverage === null ? '—' : classBook.classGeneralAverage.toFixed(2)}
                  </td>
                  <td className="px-2 py-3 text-center font-semibold tabular-nums">
                    {studentRow.generalRank
                      ? `${studentRow.generalRank}/${studentRow.ratedStudents}`
                      : '—'}
                  </td>
                  <td className="px-2 py-3 text-center text-[10px]">
                    {(() => {
                      const m = computeMention(report.generalAverage, 20);
                      return m && <span className={mentionClasses(m)}>{t(`mentions.${m}` as never)}</span>;
                    })()}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>

            {/* Bloc conseil de classe */}
            <section className="mt-6 border-t-2 border-slate-700 pt-3">
              <h2 className="mb-2 text-sm font-bold uppercase">{t('council.title')}</h2>
              <div className="hidden print:block">
                {council?.generalAppreciation && (
                  <p className="whitespace-pre-wrap text-sm">{council.generalAppreciation}</p>
                )}
                {council?.decision && (
                  <p className="mt-2 text-sm font-semibold">
                    {t('council.decision')} :{' '}
                    <span className="rounded bg-slate-100 px-2 py-0.5">
                      {t(`council.decisions.${council.decision}` as never)}
                    </span>
                  </p>
                )}
                {!council?.generalAppreciation && !council?.decision && (
                  <p className="text-xs italic text-slate-400">{t('council.empty')}</p>
                )}
              </div>
              <div className="print:hidden">
                <CouncilEditor
                  classId={id}
                  studentId={studentId}
                  periodId={selectedPeriodId!}
                  initial={{
                    generalAppreciation: council?.generalAppreciation ?? '',
                    decision: (council?.decision as string | null) ?? '',
                    heldAt: council?.heldAt ? council.heldAt.toISOString().slice(0, 10) : '',
                  }}
                />
              </div>
            </section>

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

function mentionClasses(mention: NonNullable<ReturnType<typeof computeMention>>): string {
  const base = 'rounded px-1.5 py-0.5 font-semibold';
  const colors: Record<string, string> = {
    EXCELLENT: 'bg-purple-100 text-purple-800',
    TRES_BIEN: 'bg-emerald-100 text-emerald-800',
    BIEN: 'bg-blue-100 text-blue-800',
    ASSEZ_BIEN: 'bg-slate-100 text-slate-700',
    PASSABLE: 'bg-amber-100 text-amber-800',
    INSUFFISANT: 'bg-red-100 text-red-800',
  };
  return `${base} ${colors[mention] ?? ''}`;
}
