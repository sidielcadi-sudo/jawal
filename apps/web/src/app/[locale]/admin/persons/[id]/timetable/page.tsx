import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import type { DayKey } from '@/lib/timetable-conflicts';

const DAYS: DayKey[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export default async function TeacherTimetablePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { locale, id } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const session = (await auth())!;
  const t = await getTranslations('admin.timetable');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const teacher = await tx.person.findUnique({
      where: { id },
      select: { id: true, firstName: true, lastName: true, type: true },
    });
    if (!teacher) return null;

    const years = await tx.academicYear.findMany({
      orderBy: { startDate: 'desc' },
      select: { id: true, label: true, active: true },
    });
    const yearId = sp.year ?? years.find((y) => y.active)?.id ?? years[0]?.id ?? null;

    const slots = await tx.timetableSlot.findMany({
      orderBy: [{ order: 'asc' }, { startTime: 'asc' }],
    });

    const entries = yearId
      ? await tx.timetableEntry.findMany({
          where: { teacherId: id, academicYearId: yearId },
          include: {
            subject: { select: { id: true, label: true } },
            class: { select: { id: true, name: true } },
            room: { select: { id: true, code: true, label: true } },
          },
        })
      : [];

    return { teacher, years, yearId, slots, entries };
  });

  if (!data) notFound();
  const { teacher, years, yearId, slots, entries } = data;

  // Index entries par (day, slot)
  const byKey = new Map<string, (typeof entries)[number]>();
  for (const e of entries) byKey.set(`${e.dayOfWeek}|${e.slotId}`, e);

  const totalCourses = entries.length;
  const distinctClasses = new Set(entries.map((e) => e.classId)).size;
  const distinctSubjects = new Set(entries.map((e) => e.subjectId).filter(Boolean)).size;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <nav className="mb-3 text-xs text-slate-500">
        <Link
          href={`/${locale}/admin/persons?type=TEACHER`}
          className="hover:text-brand-700"
        >
          {t('breadcrumbTeachers')}
        </Link>
        <span className="mx-1.5">›</span>
        <Link href={`/${locale}/admin/persons/${id}`} className="hover:text-brand-700">
          {teacher.lastName} {teacher.firstName}
        </Link>
        <span className="mx-1.5">›</span>
        <span>{t('title')}</span>
      </nav>

      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {t('teacherWeek')} — {teacher.lastName} {teacher.firstName}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {t('teacherWeekSummary', {
              total: totalCourses,
              classes: distinctClasses,
              subjects: distinctSubjects,
            })}
          </p>
        </div>
        <form className="flex items-center gap-2">
          <label className="text-xs text-slate-500">{t('year')}</label>
          <select
            name="year"
            defaultValue={yearId ?? ''}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.label}
                {y.active ? ' ★' : ''}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs hover:bg-slate-50"
          >
            {t('apply')}
          </button>
        </form>
      </header>

      {slots.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          {t('noSlots')}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3 text-start">{t('slot')}</th>
                {DAYS.map((d) => (
                  <th key={d} className="px-3 py-3 text-start">
                    {t(`days.${d}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {slots.map((s) => (
                <tr key={s.id} className={s.isBreak ? 'bg-amber-50/30' : ''}>
                  <th className="w-32 px-3 py-2 text-start align-top">
                    <div className="font-medium tabular-nums">{s.startTime}</div>
                    <div className="text-[10px] text-slate-400">{s.endTime}</div>
                  </th>
                  {DAYS.map((d) => {
                    if (s.isBreak) {
                      return (
                        <td
                          key={d}
                          className="px-3 py-2 text-center text-[10px] uppercase text-amber-700"
                        >
                          {s.label ?? t('break')}
                        </td>
                      );
                    }
                    const e = byKey.get(`${d}|${s.id}`);
                    return (
                      <td key={d} className="px-2 py-2 align-top">
                        {e ? (
                          <div className="rounded-lg border border-brand-200 bg-brand-50 p-2 text-[11px] leading-tight">
                            <div className="font-semibold text-slate-900">
                              {e.subject?.label ?? t('untitledCourse')}
                            </div>
                            <Link
                              href={`/${locale}/admin/classes/${e.class.id}`}
                              className="mt-0.5 block text-slate-600 hover:text-brand-700"
                            >
                              {e.class.name}
                            </Link>
                            {e.room && (
                              <div className="text-slate-500">📍 {e.room.label}</div>
                            )}
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed border-slate-100 p-2 text-center text-[10px] text-slate-300">
                            —
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
