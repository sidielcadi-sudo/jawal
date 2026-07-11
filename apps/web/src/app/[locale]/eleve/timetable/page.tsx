import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getStudentPersonId } from '@/lib/student';
import { TimetableGridReadonly, type ReadonlyEntry } from '@/components/timetable-grid-readonly';

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

export default async function StudentTimetablePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('eleve.timetable');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const studentId = await getStudentPersonId(tx, session.user.id);
    const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });
    const sc =
      studentId && year
        ? await tx.studentClass.findFirst({
            where: { studentId, unenrolledAt: null, class: { academicYearId: year.id } },
            select: { class: { select: { id: true } } },
          })
        : null;
    const classId = sc?.class.id ?? null;
    const slots = classId
      ? await tx.timetableSlot.findMany({ orderBy: [{ order: 'asc' }, { startTime: 'asc' }] })
      : [];
    const entries =
      classId && year
        ? await tx.timetableEntry.findMany({
            where: { classId, academicYearId: year.id },
            include: {
              subject: { select: { label: true } },
              teacher: { select: { firstName: true, lastName: true } },
              room: { select: { label: true } },
            },
          })
        : [];
    return { classId, slots, entries };
  });

  const dayLabels = Object.fromEntries(DAYS.map((d) => [d, t(`days.${d}`)]));
  const gridEntries: ReadonlyEntry[] = data.entries.map((e) => ({
    dayOfWeek: e.dayOfWeek,
    slotId: e.slotId,
    subjectLabel: e.subject?.label ?? null,
    teacherName: e.teacher ? `${e.teacher.lastName} ${e.teacher.firstName}` : null,
    roomLabel: e.room?.label ?? null,
  }));

  return (
    <div className="px-3 py-3">
      <header className="mb-4 overflow-hidden rounded-3xl bg-gradient-to-r from-brand-100 to-brand-50 px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
      </header>
      <div className="mt-6">
        {!data.classId ? (
          <p className="text-sm text-slate-500">{t('noClass')}</p>
        ) : (
          <TimetableGridReadonly
            days={[...DAYS]}
            dayLabels={dayLabels}
            slots={data.slots.map((s) => ({
              id: s.id,
              startTime: s.startTime,
              endTime: s.endTime,
              isBreak: s.isBreak,
            }))}
            entries={gridEntries}
            hourLabel={t('hour')}
            emptyLabel={t('empty')}
          />
        )}
      </div>
    </div>
  );
}
