'use client';

import { useTranslations } from 'next-intl';

export type EventRow = {
  id: string;
  date: string; // ISO
  category: string;
  className: string;
  justifStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  periodLabel: string | null;
  subjectLabel: string | null;
  teacherName: string | null;
  /** Rempli seulement en recherche multi-élèves. */
  studentName?: string;
};

/**
 * Événements dérivés des feuilles d'appel (lecture seule).
 *
 * Deux usages : le carnet d'un élève, et la recherche par niveau / classe. La
 * colonne « Élève » n'apparaît que dans le second cas — la répéter sur la
 * fiche d'un élève n'apporterait rien.
 */
export function CarnetEventsTable({
  events,
  locale,
  showStudent = false,
}: {
  events: EventRow[];
  locale: string;
  showStudent?: boolean;
}) {
  const t = useTranslations('carnet');
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(locale);
  const cols = showStudent ? 7 : 6;

  return (
    <section className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 table-head px-4 py-2">
        <span className="text-sm font-semibold text-slate-700">{t('eventsTitle')}</span>
        <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium tabular-nums text-slate-600">
          {t('eventsCount', { count: events.length })}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-2 text-start">{t('col.date')}</th>
              <th className="px-4 py-2 text-start">{t('col.time')}</th>
              {showStudent && <th className="px-4 py-2 text-start">{t('col.student')}</th>}
              <th className="px-4 py-2 text-start">{t('col.class')}</th>
              <th className="px-4 py-2 text-start">{t('col.teacherSubject')}</th>
              <th className="px-4 py-2 text-start">{t('col.event')}</th>
              <th className="px-4 py-2 text-start">{t('col.justif')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {events.map((ev) => (
              <tr key={ev.id}>
                <td className="px-4 py-2 text-xs text-slate-600">{fmt(ev.date)}</td>
                <td className="px-4 py-2 text-xs tabular-nums text-slate-600">
                  {ev.periodLabel ?? '—'}
                </td>
                {showStudent && (
                  <td className="px-4 py-2 text-xs font-medium text-slate-800">
                    {ev.studentName ?? '—'}
                  </td>
                )}
                <td className="px-4 py-2 text-xs text-slate-600">{ev.className}</td>
                <td className="px-4 py-2 text-xs text-slate-600">
                  {ev.teacherName || ev.subjectLabel ? (
                    <>
                      <div>{ev.teacherName ?? '—'}</div>
                      <div className="text-[11px] text-slate-400">{ev.subjectLabel ?? '—'}</div>
                    </>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">
                    {t(`eventCat.${ev.category}`)}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs">
                  {ev.justifStatus ? (
                    <span
                      className={
                        ev.justifStatus === 'APPROVED'
                          ? 'text-emerald-700'
                          : ev.justifStatus === 'REJECTED'
                            ? 'text-red-700'
                            : 'text-amber-700'
                      }
                    >
                      {t(`justif.${ev.justifStatus}`)}
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr>
                <td colSpan={cols} className="px-4 py-6 text-center text-xs text-slate-400">
                  {t('noEvent')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
