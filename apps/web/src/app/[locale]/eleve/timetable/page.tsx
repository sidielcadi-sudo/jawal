import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getStudentPersonId } from '@/lib/student';
import { upcomingOverridesForClass } from '@/lib/timetable-overrides';
import { TimetableGridReadonly, type ReadonlyEntry } from '@/components/timetable-grid-readonly';
import { UpcomingOverrides } from '@/components/upcoming-overrides';
import { personDisplayName } from '@/lib/localized-name';

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
              subject: { select: { label: true, labelAr: true } },
              teacher: { select: { firstName: true, lastName: true, firstNameAr: true, lastNameAr: true } },
              room: { select: { label: true, labelAr: true } },
            },
          })
        : [];
    const overrides = classId ? await upcomingOverridesForClass(tx, classId) : [];
    return { classId, slots, entries, overrides };
  });

  const dayLabels = Object.fromEntries(DAYS.map((d) => [d, t(`days.${d}`)]));
  const gridEntries: ReadonlyEntry[] = data.entries.map((e) => ({
    dayOfWeek: e.dayOfWeek,
    slotId: e.slotId,
    subjectLabel: e.subject?.label ?? null,
    teacherName: e.teacher ? personDisplayName(locale, e.teacher) : null,
    roomLabel: e.room?.label ?? null,
  }));

  return (
    <div className="px-3 py-3">
      <header className="mb-4 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
      </header>
      <div className="mt-6">
        {!data.classId ? (
          <p className="text-sm text-slate-500">{t('noClass')}</p>
        ) : (
          <>
          <UpcomingOverrides
            items={data.overrides}
            locale={locale}
            title={t('changesTitle')}
            substituteLabel={t('substitute')}
            cancelledLabel={t('cancelled')}
          />
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
          </>
        )}
      </div>
    </div>
  );
}
