import type { UpcomingOverride } from '@/lib/timetable-overrides';

/**
 * Bandeau « Changements à venir » listant les remplacements et annulations
 * datés d'une classe ou d'un enseignant, au-dessus de l'emploi du temps
 * hebdomadaire (qui, lui, est récurrent).
 */
export function UpcomingOverrides({
  items,
  locale,
  title,
  substituteLabel,
  cancelledLabel,
  coveringLabel,
  absentLabel,
}: {
  items: UpcomingOverride[];
  locale: string;
  title: string;
  substituteLabel: string;
  cancelledLabel: string;
  /** Vue enseignant : « vous assurez le remplacement ». Absent → vue élève. */
  coveringLabel?: string;
  /** Vue enseignant : « votre cours est couvert/annulé ». */
  absentLabel?: string;
}) {
  if (items.length === 0) return null;

  return (
    <section className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-800">
        🔄 {title}
      </h2>
      <ul className="space-y-1.5">
        {items.map((o) => {
          const dateLabel = new Date(`${o.date}T00:00:00Z`).toLocaleDateString(locale, {
            weekday: 'short',
            day: '2-digit',
            month: '2-digit',
          });
          const cancelled = o.kind === 'CANCELLED';
          return (
            <li
              key={`${o.id}-${o.role ?? ''}`}
              className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg px-2 py-1 text-sm ${
                cancelled ? 'bg-red-50 text-red-700' : ''
              }`}
            >
              <span className={`font-medium ${cancelled ? 'text-red-700' : 'text-slate-800'}`}>{dateLabel}</span>
              <span className={`text-xs ${cancelled ? 'text-red-500' : 'text-slate-500'}`}>{o.slotLabel}</span>
              <span className={cancelled ? 'text-red-700 line-through' : 'text-slate-700'}>
                {o.subjectName} · {o.className}
              </span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  cancelled ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {cancelled ? cancelledLabel : substituteLabel}
                {!cancelled && o.substituteName ? ` · ${o.substituteName}` : ''}
              </span>
              {o.role === 'covering' && coveringLabel && (
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                  {coveringLabel}
                </span>
              )}
              {o.role === 'absent' && absentLabel && (
                <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                  {absentLabel}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
