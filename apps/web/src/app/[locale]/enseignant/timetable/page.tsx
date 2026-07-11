import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getTeacherPersonId } from '@/lib/teacher';

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

export default async function TeacherTimetablePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('enseignant.timetable');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const teacherId = await getTeacherPersonId(tx, session.user.id);
    const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });
    const slots = await tx.timetableSlot.findMany({ orderBy: [{ order: 'asc' }, { startTime: 'asc' }] });
    const entries =
      teacherId && year
        ? await tx.timetableEntry.findMany({
            where: { teacherId, academicYearId: year.id },
            include: {
              subject: { select: { label: true } },
              class: { select: { name: true } },
              room: { select: { code: true, label: true } },
            },
          })
        : [];
    const byCell = new Map<string, (typeof entries)[number]>();
    for (const e of entries) byCell.set(`${e.dayOfWeek}-${e.slotId}`, e);
    return { slots, byCell, count: entries.length };
  });

  return (
    <div className="px-3 py-3">
      <header className="mb-4 overflow-hidden rounded-3xl bg-gradient-to-r from-brand-100 to-brand-50 px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
        <p className="mt-0.5 text-sm text-slate-600">{t('weeklyHoursCount', { count: data.count })}</p>
      </header>

      {data.count === 0 ? (
        <p className="mt-6 text-sm text-slate-500">{t('empty')}</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50">
                <th className="border-b border-e border-slate-200 px-2 py-2 text-start font-medium text-slate-500">
                  {t('hour')}
                </th>
                {DAYS.map((d) => (
                  <th key={d} className="border-b border-e border-slate-200 px-2 py-2 font-medium text-slate-600">
                    {t(`days.${d}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.slots.map((s) => (
                <tr key={s.id} className={s.isBreak ? 'bg-slate-50/60' : ''}>
                  <td className="whitespace-nowrap border-b border-e border-slate-100 px-2 py-2 text-slate-500 tabular-nums">
                    {s.startTime}–{s.endTime}
                  </td>
                  {DAYS.map((d) => {
                    const e = data.byCell.get(`${d}-${s.id}`);
                    return (
                      <td key={d} className="border-b border-e border-slate-100 px-1.5 py-1.5 align-top">
                        {e ? (
                          <div className="rounded-lg bg-brand-50 px-2 py-1.5">
                            <div className="font-medium text-brand-800">{e.subject?.label ?? '—'}</div>
                            <div className="text-[10px] text-slate-600">{e.class?.name ?? ''}</div>
                            {(e.room?.label || e.room?.code) && (
                              <div className="text-[10px] text-slate-500">📍 {e.room?.label ?? e.room?.code}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-200">·</span>
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
