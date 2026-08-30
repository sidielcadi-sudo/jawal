/**
 * Vue « emploi du temps du jour » (liste chronologique), inspirée de l'appli
 * mobile : chaque cours est une carte à bordure fine repérée par un chevron en
 * contour dont le tracé porte la couleur de la matière, avec plage horaire,
 * matière, prof, salle. Un cours annulé est marqué en rouge (fond clair +
 * barré). Un remplacement affiche le prof remplaçant.
 */

export type DayCourse = {
  startTime: string;
  endTime: string;
  subject: string | null;
  teacher: string | null;
  room: string | null;
  isBreak: boolean;
  cancelled: boolean;
  substituteName: string | null;
};

// Palette pour la barre latérale (matière → couleur déterministe).
const BAR_COLORS = [
  '#f59e0b',
  '#eab308',
  '#e11d48',
  '#d946ef',
  '#3b82f6',
  '#10b981',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
];
function colorFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return BAR_COLORS[h % BAR_COLORS.length]!;
}

export function DayTimetable({
  courses,
  labels,
}: {
  courses: DayCourse[];
  labels: { empty: string; cancelled: string; substitute: string; break: string };
}) {
  if (courses.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
        {labels.empty}
      </p>
    );
  }

  return (
    <ul className="space-y-2.5">
      {courses.map((c, i) => {
        if (c.isBreak) {
          return (
            <li key={i} className="flex items-center gap-3 ps-1">
              <div className="w-14 shrink-0 text-xs text-slate-400">
                <div>{c.startTime}</div>
                <div>{c.endTime}</div>
              </div>
              <div className="h-8 w-1.5 shrink-0 rounded-full bg-slate-200" />
              <span className="text-lg" aria-hidden>
                🍽️
              </span>
              <span className="text-xs text-slate-400">{labels.break}</span>
            </li>
          );
        }
        const bar = c.cancelled ? '#ef4444' : colorFor(c.subject ?? '');
        return (
          <li
            key={i}
            className={`relative flex items-center gap-3 rounded-xl border py-2 pe-3 ps-2 ${
              c.cancelled ? 'border-red-200 bg-red-50' : 'border-brand-200 bg-white'
            }`}
          >
            <div className="w-14 shrink-0 text-xs text-slate-500">
              <div className="font-semibold text-slate-700">{c.startTime}</div>
              <div>{c.endTime}</div>
            </div>
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="edt-chevron h-12 w-12 shrink-0"
              fill="none"
              stroke={bar}
              strokeWidth={1.8}
              strokeLinejoin="round"
              strokeLinecap="round"
            >
              <path d="M6 2 L21 12 L6 22 L12 12 Z" />
            </svg>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`font-bold uppercase ${
                    c.cancelled ? 'text-red-700 line-through' : 'text-slate-900'
                  }`}
                >
                  {c.subject ?? '—'}
                </span>
                {c.cancelled && (
                  <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-700">
                    {labels.cancelled}
                  </span>
                )}
              </div>
              {c.teacher && (
                <div className={`text-sm ${c.cancelled ? 'text-red-500 line-through' : 'text-slate-600'}`}>
                  {c.teacher}
                </div>
              )}
              {c.room && (
                <div className={`text-sm ${c.cancelled ? 'text-red-400' : 'text-slate-500'}`}>{c.room}</div>
              )}
              {!c.cancelled && c.substituteName && (
                <div className="mt-0.5 text-xs font-medium text-amber-700">
                  {labels.substitute} : {c.substituteName}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
