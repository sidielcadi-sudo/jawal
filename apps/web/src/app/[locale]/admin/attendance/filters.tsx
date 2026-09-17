'use client';

import { useRouter } from 'next/navigation';

/**
 * Barre de filtres : jour et classe.
 *
 * La sélection passe par l'URL et non par un état local, pour que la vue d'un
 * jour donné reste partageable et survive à un rechargement. Changer de filtre
 * remet la pagination à la première page : rester page 7 après avoir réduit la
 * liste à une classe afficherait un tableau vide.
 *
 * Le jour est borné à l'année scolaire active (`minDate` / `maxDate`) ; l'onglet
 * et le cycle choisis sont conservés (`keep`).
 */
export function AttendanceFilters({
  base,
  date,
  today,
  minDate,
  maxDate,
  classId,
  classes,
  allLabel,
  todayLabel,
  keep = {},
}: {
  base: string;
  date: string;
  today: string;
  minDate: string;
  maxDate: string;
  classId: string;
  classes: Array<{ id: string; label: string }>;
  allLabel: string;
  todayLabel: string;
  keep?: Record<string, string | undefined>;
}) {
  const router = useRouter();

  const go = (patch: { date?: string; class?: string }) => {
    const next = { date, class: classId, ...patch };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(keep)) if (v) qs.set(k, v);
    qs.set('date', next.date);
    if (next.class && next.class !== 'all') qs.set('class', next.class);
    router.push(`${base}?${qs.toString()}`);
  };

  const field =
    'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800';

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={date}
          min={minDate}
          max={maxDate}
          onChange={(e) => e.target.value && go({ date: e.target.value })}
          className={field}
        />
        {date === today && (
          <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-medium text-brand-700">
            {todayLabel}
          </span>
        )}
      </div>

      <select value={classId} onChange={(e) => go({ class: e.target.value })} className={field}>
        <option value="all">{allLabel}</option>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
    </div>
  );
}
