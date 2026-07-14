import Link from 'next/link';
import type { TeacherSession } from '@/lib/lesson-book';

type Day = { date: string; dow: string };

/**
 * EDT hebdomadaire de l'enseignant sous forme de tableau (façon Pronote) :
 * colonnes = jours (lun→sam), lignes = créneaux horaires. Chaque case occupée
 * est un lien vers la saisie du cahier de la séance. La séance active (page de
 * détail) est mise en évidence. Pur rendu — aucune donnée chargée ici.
 */
/**
 * `lesson` : vert = cahier rempli, ambre = à remplir.
 * `appel`  : vert = appel fait, rose = appel à faire.
 * Dans les deux cas l'état est porté par `TeacherSession.filled`.
 */
type Variant = 'lesson' | 'appel';

const VARIANT_STYLES: Record<Variant, { done: string; todo: string; dotDone: string; dotTodo: string }> = {
  lesson: {
    done: 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100',
    todo: 'border-amber-200 bg-amber-50 hover:bg-amber-100',
    dotDone: 'bg-emerald-500',
    dotTodo: 'bg-amber-500',
  },
  appel: {
    done: 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100',
    todo: 'border-rose-200 bg-rose-50 hover:bg-rose-100',
    dotDone: 'bg-emerald-500',
    dotTodo: 'bg-rose-500',
  },
};

export function WeekGrid({
  days,
  sessions,
  base,
  monday,
  activeKey,
  locale,
  variant = 'lesson',
}: {
  days: Day[];
  sessions: TeacherSession[];
  base: string;
  monday: string;
  activeKey?: string;
  locale: string;
  variant?: Variant;
}) {
  const vs = VARIANT_STYLES[variant];
  // Axe des lignes : créneaux distincts (start–end) triés par heure de début.
  const slotMap = new Map<string, { start: string; end: string }>();
  for (const s of sessions) {
    const key = `${s.slotStart}-${s.slotEnd}`;
    if (!slotMap.has(key)) slotMap.set(key, { start: s.slotStart, end: s.slotEnd });
  }
  const slots = [...slotMap.values()].sort((a, b) => a.start.localeCompare(b.start));

  // Index des séances par (jour, créneau).
  const cell = new Map<string, TeacherSession>();
  for (const s of sessions) cell.set(`${s.dow}|${s.slotStart}-${s.slotEnd}`, s);

  const fmtHead = (iso: string) =>
    new Date(`${iso}T00:00:00.000Z`).toLocaleDateString(locale, {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      timeZone: 'UTC',
    });

  return (
    <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
      <table className="w-full table-fixed border-collapse text-center text-xs">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <th className="w-14 px-1 py-2 font-medium" />
            {days.map((d) => (
              <th key={d.date} className="px-1 py-2 font-medium capitalize text-slate-600">
                {fmtHead(d.date)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slots.map((slot) => {
            const slotKey = `${slot.start}-${slot.end}`;
            return (
              <tr key={slotKey} className="border-b border-slate-100 last:border-0">
                <th className="bg-slate-50/60 px-1 py-1.5 align-middle text-[10px] font-normal tabular-nums text-slate-400">
                  {slot.start}
                  <br />
                  {slot.end}
                </th>
                {days.map((d) => {
                  const s = cell.get(`${d.dow}|${slotKey}`);
                  if (!s)
                    return (
                      <td key={d.date} className="px-1 py-1.5">
                        <span className="text-slate-300">—</span>
                      </td>
                    );
                  const isActive = activeKey === `${s.entryId}|${s.date}`;
                  return (
                    <td key={d.date} className="p-1 align-top">
                      <Link
                        href={`${base}/${s.entryId}/${s.date}?week=${monday}`}
                        className={`block rounded-lg border px-1.5 py-1.5 text-start transition-colors ${
                          isActive
                            ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-400'
                            : s.filled
                              ? vs.done
                              : vs.todo
                        }`}
                        title={`${s.className}${s.subject ? ` · ${s.subject}` : ''}${s.room ? ` · ${s.room}` : ''}`}
                      >
                        <span className="flex items-center justify-between gap-1">
                          <span className="truncate font-semibold text-slate-800">
                            {s.className}
                          </span>
                          <span
                            className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                              s.filled ? vs.dotDone : vs.dotTodo
                            }`}
                          />
                        </span>
                        {s.subject && (
                          <span className="block truncate text-[11px] text-slate-600">
                            {s.subject}
                          </span>
                        )}
                        {s.room && (
                          <span className="block truncate text-[10px] text-slate-400">
                            {s.room}
                          </span>
                        )}
                      </Link>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
