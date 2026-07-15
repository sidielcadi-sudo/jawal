import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getTeacherPersonId } from '@/lib/teacher';
import { SaisieGrid } from './saisie-grid';
import { pickPeriodId } from '@/lib/periods';

export default async function NotesSaisiePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ class?: string; period?: string; subject?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('enseignant.notes');
  const session = (await auth())!;

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const teacherId = await getTeacherPersonId(tx, session.user.id);
    const year = await tx.academicYear.findFirst({
      where: { active: true },
      include: { periods: { orderBy: { startDate: 'asc' } } },
    });
    if (!teacherId || !year) return null;

    // Services du prof : couples (classe × matière) via affectations + EDT.
    const select = {
      classId: true,
      subjectId: true,
      subject: { select: { label: true } },
      class: { select: { name: true } },
    } as const;
    const [assignments, entries] = await Promise.all([
      tx.teacherAssignment.findMany({ where: { teacherId, academicYearId: year.id }, select }),
      tx.timetableEntry.findMany({ where: { teacherId, academicYearId: year.id }, select }),
    ]);
    const services = new Map<
      string,
      { classId: string; className: string; subjectId: string; subjectLabel: string }
    >();
    for (const a of [...assignments, ...entries]) {
      if (!a.subjectId) continue;
      const key = `${a.classId}|${a.subjectId}`;
      if (!services.has(key))
        services.set(key, {
          classId: a.classId,
          className: a.class.name,
          subjectId: a.subjectId,
          subjectLabel: a.subject?.label ?? '—',
        });
    }
    const svc = [...services.values()].sort(
      (a, b) => a.className.localeCompare(b.className) || a.subjectLabel.localeCompare(b.subjectLabel),
    );

    // Classes distinctes.
    const classes = [...new Map(svc.map((s) => [s.classId, s.className])).entries()].map(
      ([id, name]) => ({ id, name }),
    );

    // Sélection courante.
    const classId = svc.find((s) => s.classId === sp.class)?.classId ?? svc[0]?.classId ?? null;
    const subjectsForClass = svc.filter((s) => s.classId === classId);
    const subjectId =
      subjectsForClass.find((s) => s.subjectId === sp.subject)?.subjectId ??
      subjectsForClass[0]?.subjectId ??
      null;
    const periodId = pickPeriodId(year.periods, sp.period);

    if (!classId || !subjectId || !periodId) {
      return { svc, classes, subjectsForClass, periods: year.periods, classId, subjectId, periodId, grid: null };
    }

    const students = await tx.studentClass.findMany({
      where: { classId, unenrolledAt: null },
      include: { student: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { student: { lastName: 'asc' } },
    });
    const devoirs = await tx.evaluation.findMany({
      where: { classId, subjectId, periodId },
      orderBy: { date: 'desc' },
      include: { grades: { select: { studentId: true, value: true } } },
    });

    return {
      svc,
      classes,
      subjectsForClass,
      periods: year.periods,
      classId,
      subjectId,
      periodId,
      grid: {
        students: students.map((s) => ({
          id: s.student.id,
          firstName: s.student.firstName,
          lastName: s.student.lastName,
        })),
        devoirs: devoirs.map((d) => ({
          id: d.id,
          label: d.label,
          date: d.date.toISOString().slice(0, 10),
          maxValue: d.maxValue,
          weight: d.weight,
          optional: d.optional,
          optionalMode: d.optionalMode as 'BONUS' | 'NOTE',
          grades: Object.fromEntries(
            d.grades.map((g) => [g.studentId, g.value] as const),
          ) as Record<string, number | null>,
        })),
      },
    };
  });

  if (!data) {
    return <p className="text-sm text-slate-500">{t('noService')}</p>;
  }

  const { classes, subjectsForClass, periods, classId, subjectId, periodId, grid } = data;

  return (
    <div>
      {/* Sélecteurs */}
      <form method="get" className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-slate-700">{t('saisieTitle')}</span>
        <select
          name="class"
          defaultValue={classId ?? ''}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm"
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          name="period"
          defaultValue={periodId ?? ''}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm"
        >
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <select
          name="subject"
          defaultValue={subjectId ?? ''}
          className="min-w-[16rem] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm"
        >
          {subjectsForClass.map((s) => (
            <option key={s.subjectId} value={s.subjectId}>
              {s.subjectLabel} — {s.className}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          {t('apply')}
        </button>
      </form>

      {grid && classId && subjectId && periodId ? (
        <SaisieGrid
          locale={locale}
          classId={classId}
          subjectId={subjectId}
          periodId={periodId}
          students={grid.students}
          devoirs={grid.devoirs}
        />
      ) : (
        <p className="text-sm text-slate-500">{t('noService')}</p>
      )}
    </div>
  );
}
