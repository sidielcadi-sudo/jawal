import Link from 'next/link';
import { ClassNav } from '../class-nav';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { computeClassBook } from '@/lib/grades';
import { pickPeriodId } from '@/lib/periods';

export default async function GradeBookPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { locale, id } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('admin.gradeBook');

  const session = (await auth())!;
  const tenantId = session.user.tenantId;

  const data = await withTenant(tenantId, async (tx) => {
    const cls = await tx.class.findUnique({
      where: { id },
      include: {
        academicYear: { include: { periods: { orderBy: { startDate: 'asc' } } } },
        level: { include: { cycle: true } },
        students: {
          where: { unenrolledAt: null },
          include: { student: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { student: { lastName: 'asc' } },
        },
      },
    });
    if (!cls) return null;

    const subjects = await tx.subject.findMany({
      orderBy: [{ order: 'asc' }, { label: 'asc' }],
    });

    // Période sélectionnée : explicite via querystring, sinon le trimestre courant
    const selectedPeriodId = pickPeriodId(cls.academicYear.periods, sp.period) ?? undefined;
    if (!selectedPeriodId) {
      return { cls, subjects, periods: cls.academicYear.periods, selectedPeriodId: null, book: null };
    }

    const book = await computeClassBook(tx, {
      classId: id,
      periodId: selectedPeriodId,
      students: cls.students.map((sc) => ({
        id: sc.student.id,
        firstName: sc.student.firstName,
        lastName: sc.student.lastName,
      })),
      allSubjects: subjects.map((s) => ({
        id: s.id,
        label: s.label,
        scale: s.scale,
        coefficient: s.coefficient,
        order: s.order,
      })),
    });

    return { cls, subjects, periods: cls.academicYear.periods, selectedPeriodId, book };
  });

  if (!data) notFound();
  const { cls, subjects, periods, selectedPeriodId, book } = data;
  const baseHref = `/${locale}/admin/classes/${id}`;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <nav className="mb-4 text-xs text-slate-500">
        <Link href={`/${locale}/admin/classes`} className="hover:text-brand-700">
          {t('classes')}
        </Link>
        <span className="mx-1.5">›</span>
        <Link href={baseHref} className="hover:text-brand-700">
          {cls.name}
        </Link>
        <span className="mx-1.5">›</span>
        <span>{t('title')}</span>
      </nav>

      <header className="-mx-4 sm:-mx-6 overflow-hidden rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-3 mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {t('title')} — {cls.name}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {cls.level.cycle.label} · {cls.level.label} · {cls.academicYear.label}
          </p>
        </div>
        <ClassNav classId={id} locale={locale} />
      </header>

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
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

      {!book || subjects.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          {subjects.length === 0 ? t('noSubjects') : t('noPeriod')}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
              <tr>
                <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-start">
                  {t('table.student')}
                </th>
                {subjects.map((s) => (
                  <th key={s.id} className="px-3 py-3 text-end">
                    <div className="font-semibold text-slate-700">{s.label}</div>
                    <div className="text-[10px] font-normal text-slate-500">
                      /{s.scale} · ×{s.coefficient}
                    </div>
                  </th>
                ))}
                <th className="px-3 py-3 text-end font-semibold text-brand-700">
                  {t('table.general')}
                </th>
                <th className="px-3 py-3 text-end">{t('table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {book.rows.map((row) => (
                <tr key={row.studentId} className="hover:bg-slate-50">
                  <td className="sticky left-0 z-10 bg-white px-4 py-2 font-medium text-slate-900 group-hover:bg-slate-50">
                    {row.lastName} {row.firstName}
                  </td>
                  {row.subjects.map((s) => (
                    <td key={s.subjectId} className="px-3 py-2 text-end tabular-nums">
                      {s.average === null ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <span className={colorFor(s.average, s.subjectScale)}>
                          {s.average.toFixed(2)}
                        </span>
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-end font-semibold tabular-nums">
                    {row.generalAverage === null ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <span className={colorFor(row.generalAverage, 20)}>
                        {row.generalAverage.toFixed(2)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-end">
                    {selectedPeriodId && (
                      <Link
                        href={`${baseHref}/bulletins/${row.studentId}?period=${selectedPeriodId}`}
                        className="text-xs text-brand-700 hover:underline"
                      >
                        {t('table.bulletin')}
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
              {book.rows.length === 0 && (
                <tr>
                  <td colSpan={subjects.length + 3} className="px-4 py-10 text-center text-slate-500">
                    {t('noStudents')}
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="border-t border-slate-200 bg-slate-50 text-xs">
              <tr>
                <td className="sticky left-0 bg-slate-50 px-4 py-3 font-semibold text-slate-700">
                  {t('table.classAvg')}
                </td>
                {subjects.map((s) => {
                  const avg = book.classSubjectAverages.get(s.id);
                  return (
                    <td key={s.id} className="px-3 py-3 text-end font-semibold tabular-nums text-slate-700">
                      {avg === null || avg === undefined ? '—' : avg.toFixed(2)}
                    </td>
                  );
                })}
                <td className="px-3 py-3 text-end font-semibold tabular-nums text-brand-700">
                  {book.classGeneralAverage === null ? '—' : book.classGeneralAverage.toFixed(2)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function colorFor(value: number, scale: number): string {
  const pct = value / scale;
  if (pct >= 0.7) return 'text-emerald-700';
  if (pct >= 0.5) return 'text-slate-700';
  if (pct >= 0.3) return 'text-amber-700';
  return 'text-red-700';
}
