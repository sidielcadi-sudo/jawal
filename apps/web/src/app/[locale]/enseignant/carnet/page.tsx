import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getTeacherPersonId } from '@/lib/teacher';
import { loadStudentCarnet } from '@/lib/carnet';
import { CarnetView } from '@/components/carnet/carnet-view';
import { CarnetEventsTable } from '@/components/carnet/carnet-events-table';
import { CarnetFilters } from '@/components/carnet/carnet-filters';
import { personDisplayName, localizedLabel } from '@/lib/localized-name';

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

    const select = { classId: true, class: { select: { name: true, nameAr: true } } } as const;
    const [a, e] = await Promise.all([
      tx.teacherAssignment.findMany({ where: { teacherId, academicYearId: year.id }, select }),
      tx.timetableEntry.findMany({ where: { teacherId, academicYearId: year.id }, select }),
    ]);
    const classes = [
      ...new Map([...a, ...e].map((x) => [x.classId, localizedLabel(locale, x.class.name, x.class.nameAr)])).entries(),
    ].map(([id, name]) => ({ id, name }));
    classes.sort((x, y) => x.name.localeCompare(y.name));

    const classId = classes.find((c) => c.id === sp.class)?.id ?? classes[0]?.id ?? null;
    if (!classId) return { classes, students: [], classId, studentId: null, carnet: null };

    const scs = await tx.studentClass.findMany({
      // Élèves actifs uniquement : exclut les radiés/supprimés du menu.
      where: { classId, unenrolledAt: null, student: { deletedAt: null } },
      include: { student: { select: { id: true, firstName: true, lastName: true, firstNameAr: true, lastNameAr: true } } },
      orderBy: { student: { lastName: 'asc' } },
    });
    const students = scs.map((s) => ({
      id: s.student.id,
      name: personDisplayName(locale, s.student),
    }));
    const studentId = students.find((s) => s.id === sp.student)?.id ?? students[0]?.id ?? null;
    const carnet = studentId ? await loadStudentCarnet(tx, studentId) : null;
    return { classes, students, classId, studentId, carnet };
  });

  if (!data) return <div className="mx-auto max-w-5xl px-6 py-8 text-sm text-slate-500">{t('noAccess')}</div>;
  const { classes, students, classId, studentId, carnet } = data;

  return (
    <div className="px-3 py-3">
      <header className="mb-4 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
      </header>

      <CarnetFilters classes={classes} students={students} classId={classId} studentId={studentId} />

      <div className="mt-6">
        {studentId && carnet ? (
          <div className="space-y-6">
            <CarnetEventsTable
            events={carnet.events.map((ev) => ({
              id: ev.id,
              date: ev.date.toISOString(),
              category: ev.category,
              className: ev.className,
              justifStatus: ev.justifStatus,
              periodLabel: ev.periodLabel,
              subjectLabel: ev.subjectLabel,
              teacherName: ev.teacherName,
            }))}
            locale={locale}
          />

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
            allowedTypes={['OBSERVATION', 'ENCOURAGEMENT', 'DEFAUT_CARNET']}
            canDelete={false}
            locale={locale}
          />
          </div>
        ) : (
          <p className="text-sm text-slate-500">{t('noStudent')}</p>
        )}
      </div>
    </div>
  );
}
