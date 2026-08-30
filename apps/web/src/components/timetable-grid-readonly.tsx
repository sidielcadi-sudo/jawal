/**
 * Grille d'emploi du temps en lecture seule (jours × créneaux).
 * Cellule = matière + (prof) + 📍 salle. Réutilisée par les portails
 * (parent, et élève plus tard). Composant serveur — libellés passés en props.
 */

export type ReadonlySlot = {
  id: string;
  startTime: string;
  endTime: string;
  isBreak: boolean;
};

export type ReadonlyEntry = {
  dayOfWeek: string;
  slotId: string;
  subjectLabel: string | null;
  teacherName?: string | null;
  roomLabel?: string | null;
};

export function TimetableGridReadonly({
  days,
  dayLabels,
  slots,
  entries,
  hourLabel,
  emptyLabel,
}: {
  days: string[];
  dayLabels: Record<string, string>;
  slots: ReadonlySlot[];
  entries: ReadonlyEntry[];
  hourLabel: string;
  emptyLabel: string;
}) {
  const byCell = new Map<string, ReadonlyEntry>();
  for (const e of entries) byCell.set(`${e.dayOfWeek}-${e.slotId}`, e);

  if (entries.length === 0) {
    return <p className="text-sm text-slate-500">{emptyLabel}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-brand-200 bg-white">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-slate-50">
            <th className="border-b border-e border-slate-200 px-2 py-2 text-start font-medium text-slate-500">
              {hourLabel}
            </th>
            {days.map((d) => (
              <th
                key={d}
                className="border-b border-e border-slate-200 px-2 py-2 font-medium text-slate-600"
              >
                {dayLabels[d] ?? d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slots.map((s) => (
            <tr key={s.id} className={s.isBreak ? 'bg-slate-50/60' : ''}>
              <td className="whitespace-nowrap border-b border-e border-slate-100 px-2 py-2 tabular-nums text-slate-500">
                {s.startTime}–{s.endTime}
              </td>
              {days.map((d) => {
                const e = s.isBreak ? undefined : byCell.get(`${d}-${s.id}`);
                return (
                  <td
                    key={d}
                    className="border-b border-e border-slate-100 px-1.5 py-1.5 align-top"
                  >
                    {e ? (
                      <div className="rounded-lg border border-brand-200 bg-brand-50 px-2 py-1.5">
                        <div className="font-medium text-brand-800">{e.subjectLabel ?? '—'}</div>
                        {e.teacherName && (
                          <div className="text-[10px] text-slate-600">{e.teacherName}</div>
                        )}
                        {e.roomLabel && (
                          <div className="text-[10px] text-slate-500">📍 {e.roomLabel}</div>
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
  );
}
