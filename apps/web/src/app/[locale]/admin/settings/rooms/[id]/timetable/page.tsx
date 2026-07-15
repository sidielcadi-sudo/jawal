import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import type { DayKey } from '@/lib/timetable-conflicts';

const DAYS: DayKey[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export default async function RoomTimetablePage({
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
    const room = await tx.room.findUnique({ where: { id } });
    if (!room) return null;

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
          where: { roomId: id, academicYearId: yearId },
          include: {
            subject: { select: { label: true } },
            class: { select: { id: true, name: true } },
            teacher: { select: { firstName: true, lastName: true } },
          },
        })
      : [];

    return { room, years, yearId, slots, entries };
  });

  if (!data) notFound();
  const { room, years, yearId, slots, entries } = data;

  const byKey = new Map<string, (typeof entries)[number]>();
  for (const e of entries) byKey.set(`${e.dayOfWeek}|${e.slotId}`, e);

  const totalCourses = entries.length;
  const distinctClasses = new Set(entries.map((e) => e.classId)).size;
  // Occupation = entries / (slots non-pause × 6 jours)
  const usableSlots = slots.filter((s) => !s.isBreak).length;
  const totalCells = usableSlots * DAYS.length;
  const occupancy = totalCells > 0 ? (totalCourses / totalCells) * 100 : 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <nav className="mb-3 text-xs text-slate-500">
        <Link href={`/${locale}/admin/settings/rooms`} className="hover:text-brand-700">
          {t('breadcrumbRooms')}
        </Link>
        <span className="mx-1.5">›</span>
        <span>{room.code}</span>
        <span className="mx-1.5">›</span>
        <span>{t('title')}</span>
      </nav>

      <header className="-mx-4 sm:-mx-6 overflow-hidden rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-3 mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {t('roomWeek')} — {room.code}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {room.label}
            {' · '}
            {t('roomWeekSummary', {
              total: totalCourses,
              classes: distinctClasses,
              occupancy: occupancy.toFixed(0),
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

      <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
        {t('roomOccupancyReadOnly')}
      </div>

      {slots.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          {t('noSlots')}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
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
                    <div className="font-medium tabular-nums">
                      {s.startTime}
                      <span className="text-slate-400"> – {s.endTime}</span>
                    </div>
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
                            {e.teacher && (
                              <div className="text-slate-500">
                                {e.teacher.lastName} {e.teacher.firstName}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed border-slate-100 p-2 text-center text-[10px] text-slate-300">
                            {t('roomFree')}
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
