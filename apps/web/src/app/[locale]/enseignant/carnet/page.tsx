import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getTeacherPersonId } from '@/lib/teacher';
import { loadStudentCarnet } from '@/lib/carnet';
import { CarnetView } from '@/components/carnet/carnet-view';

export default async function TeacherCarnetPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ class?: string; student?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('carnet');
  const session = (await auth())!;

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const teacherId = await getTeacherPersonId(tx, session.user.id);
    const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });
    if (!teacherId || !year) return null;

    const select = { classId: true, class: { select: { name: true } } } as const;
    const [a, e] = await Promise.all([
      tx.teacherAssignment.findMany({ where: { teacherId, academicYearId: year.id }, select }),
      tx.timetableEntry.findMany({ where: { teacherId, academicYearId: year.id }, select }),
    ]);
    const classes = [
      ...new Map([...a, ...e].map((x) => [x.classId, x.class.name])).entries(),
    ].map(([id, name]) => ({ id, name }));
    classes.sort((x, y) => x.name.localeCompare(y.name));

    const classId = classes.find((c) => c.id === sp.class)?.id ?? classes[0]?.id ?? null;
    if (!classId) return { classes, students: [], classId, studentId: null, carnet: null };

    const scs = await tx.studentClass.findMany({
      where: { classId, unenrolledAt: null },
      include: { student: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { student: { lastName: 'asc' } },
    });
    const students = scs.map((s) => ({
      id: s.student.id,
      name: `${s.student.lastName} ${s.student.firstName}`,
    }));
    const studentId = students.find((s) => s.id === sp.student)?.id ?? students[0]?.id ?? null;
    const carnet = studentId ? await loadStudentCarnet(tx, studentId) : null;
    return { classes, students, classId, studentId, carnet };
  });

  if (!data) return <div className="mx-auto max-w-5xl px-6 py-8 text-sm text-slate-500">{t('noAccess')}</div>;
  const { classes, students, classId, studentId, carnet } = data;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-semibold text-slate-900">{t('title')}</h1>

      <form method="get" className="mt-4 flex flex-wrap items-center gap-3">
        <select name="class" defaultValue={classId ?? ''} className="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm">
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select name="student" defaultValue={studentId ?? ''} className="min-w-[14rem] rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm">
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
          {t('apply')}
        </button>
      </form>

      <div className="mt-6">
        {studentId && carnet ? (
          <CarnetView
            studentId={studentId}
            entries={carnet.entries.map((e) => ({
              id: e.id,
              type: e.type,
              content: e.content,
              occurredAt: e.occurredAt.toISOString(),
              authorName: e.authorName,
              authorRole: e.authorRole,
              className: e.className,
              subjectLabel: e.subjectLabel,
            }))}
            events={carnet.events.map((ev) => ({
              id: ev.id,
              date: ev.date.toISOString(),
              category: ev.category,
              className: ev.className,
              justifStatus: ev.justifStatus,
            }))}
            allowedTypes={['OBSERVATION', 'ENCOURAGEMENT']}
            canDelete={false}
            locale={locale}
          />
        ) : (
          <p className="text-sm text-slate-500">{t('noStudent')}</p>
        )}
      </div>
    </div>
  );
}
