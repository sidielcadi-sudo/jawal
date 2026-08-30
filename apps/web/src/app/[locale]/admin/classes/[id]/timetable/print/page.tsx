import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import type { DayKey } from '@/lib/timetable-conflicts';
import { PrintButton } from '../../../../print-button';
import { personDisplayName, localizedLabel } from '@/lib/localized-name';

const DAYS: DayKey[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export default async function ClassTimetablePrintPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = (await auth())!;
  const t = await getTranslations('admin.timetable');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const cls = await tx.class.findUnique({
      where: { id },
      include: { academicYear: true, level: { include: { cycle: true } } },
    });
    if (!cls) return null;
    const slots = await tx.timetableSlot.findMany({
      orderBy: [{ order: 'asc' }, { startTime: 'asc' }],
    });
    const entries = await tx.timetableEntry.findMany({
      where: { classId: id, academicYearId: cls.academicYearId },
      include: {
        subject: { select: { label: true, labelAr: true } },
        teacher: { select: { firstName: true, lastName: true, firstNameAr: true, lastNameAr: true } },
        room: { select: { code: true, label: true, labelAr: true } },
      },
    });
    const tenant = await tx.tenant.findFirstOrThrow();
    return { cls, slots, entries, tenant };
  });

  if (!data) notFound();
  const { cls, slots, entries, tenant } = data;
  const byKey = new Map<string, (typeof entries)[number]>();
  for (const e of entries) byKey.set(`${e.dayOfWeek}|${e.slotId}`, e);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 print:px-0 print:py-0">
      <header className="mb-4 flex items-start justify-between gap-4 print:mb-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">
            {tenant.name}
          </div>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">
            {t('title')} — {localizedLabel(locale, cls.name, cls.nameAr)}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {localizedLabel(locale, cls.level.cycle.label, cls.level.cycle.labelAr)} · {localizedLabel(locale, cls.level.label, cls.level.labelAr)} · {cls.academicYear.label}
          </p>
        </div>
        <PrintButton labelPrint={t('print')} />
      </header>

      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-slate-300 bg-slate-50 text-[10px] uppercase text-slate-500">
            <th className="border-e border-slate-200 px-2 py-2 text-start">{t('slot')}</th>
            {DAYS.map((d) => (
              <th key={d} className="border-e border-slate-200 px-2 py-2 text-start">
                {t(`days.${d}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slots.map((s) => (
            <tr
              key={s.id}
              className={`border-b border-slate-200 ${s.isBreak ? 'bg-amber-50/40' : ''}`}
            >
              <th className="border-e border-slate-200 px-2 py-1.5 text-start align-top">
                <div className="font-medium tabular-nums">{s.startTime}</div>
                <div className="text-[9px] text-slate-400">{s.endTime}</div>
              </th>
              {DAYS.map((d) => {
                if (s.isBreak) {
                  return (
                    <td
                      key={d}
                      className="border-e border-slate-200 px-2 py-1.5 text-center text-[9px] uppercase text-amber-700"
                    >
                      {s.label ?? t('break')}
                    </td>
                  );
                }
                const e = byKey.get(`${d}|${s.id}`);
                return (
                  <td key={d} className="border-e border-slate-200 px-2 py-1.5 align-top">
                    {e ? (
                      <>
                        <div className="font-semibold">{e.subject?.label ?? '—'}</div>
                        {e.teacher && (
                          <div className="text-slate-600">
                            {personDisplayName(locale, e.teacher)}
                          </div>
                        )}
                        {e.room && <div className="text-slate-500">{localizedLabel(locale, e.room.label, e.room.labelAr)}</div>}
                      </>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <footer className="mt-4 text-[10px] text-slate-400 print:fixed print:bottom-4">
        {t('printedOn', { date: new Date().toLocaleString(locale) })}
      </footer>
    </div>
  );
}
