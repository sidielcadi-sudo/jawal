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
  coveringTitle,
  absentTitle,
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
  /** Vue enseignant : deux listes séparées, sous ces titres. */
  coveringTitle?: string;
  absentTitle?: string;
}) {
  if (items.length === 0) return null;

  // Vue enseignant : ce qu'il assure et ce qu'il ne fera pas ne se
  // lisent pas ensemble — deux listes plutôt qu'une.
  if (coveringTitle && absentTitle) {
    const covering = items.filter((o) => o.role === 'covering');
    const absent = items.filter((o) => o.role !== 'covering');
    return (
      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {[
          { key: 'covering', title: coveringTitle, rows: covering, tone: 'border-amber-200 bg-amber-50/60 text-amber-800' },
          { key: 'absent', title: absentTitle, rows: absent, tone: 'border-rose-200 bg-rose-50/60 text-rose-800' },
        ].map((block) => (
          <section key={block.key} className={`rounded-2xl border p-4 ${block.tone}`}>
            <h2 className="mb-2 text-sm font-semibold">{block.title}</h2>
            {block.rows.length === 0 ? (
              <p className="text-xs text-slate-400">—</p>
            ) : (
              <ul className="space-y-1.5">
                {block.rows.map((o) => (
                  <OverrideLine
                    key={`${o.id}-${o.role ?? ''}`}
                    o={o}
                    locale={locale}
                    substituteLabel={substituteLabel}
                    cancelledLabel={cancelledLabel}
                  />
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    );
  }

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

/** Une ligne de changement : date, créneau, cours, et qui l'assure. */
function OverrideLine({
  o,
  locale,
  substituteLabel,
  cancelledLabel,
}: {
  o: UpcomingOverride;
  locale: string;
  substituteLabel: string;
  cancelledLabel: string;
}) {
  const dateLabel = new Date(`${o.date}T00:00:00Z`).toLocaleDateString(locale, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  });
  const cancelled = o.kind === 'CANCELLED';
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg bg-white/70 px-2 py-1 text-sm">
      <span className="font-medium text-slate-800">{dateLabel}</span>
      <span className="text-xs text-slate-500">{o.slotLabel}</span>
      <span className={cancelled ? 'text-red-700 line-through' : 'text-slate-700'}>
        {o.subjectName} · {o.className}
      </span>
      <span
        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
          cancelled ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
        }`}
      >
        {cancelled ? cancelledLabel : substituteLabel}
        {!cancelled && o.substituteName && o.role !== 'covering' ? ` · ${o.substituteName}` : ''}
      </span>
    </li>
  );
}
