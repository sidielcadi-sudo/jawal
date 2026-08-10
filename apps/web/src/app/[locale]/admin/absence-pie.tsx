/**
 * Camembert « répartition des absences » (part-à-tout, 3 parts).
 *
 * SVG rendu côté serveur : aucune dépendance graphique, aucun JS client. Les
 * parts portent un `<title>` (infobulle native au survol) et la légende répète
 * valeur + pourcentage — l'identité d'une part n'est donc jamais portée par la
 * couleur seule.
 *
 * Couleurs : palette de **statut** (justifiée = bon, en attente = à traiter,
 * non justifiée = critique), pas des couleurs de série — la part a bien un sens
 * d'état ici. Toujours accompagnées de leur libellé.
 */

type Slice = { key: string; label: string; value: number; color: string };

const COLORS = {
  justified: '#0ca30c',
  pending: '#fab219',
  unjustified: '#d03b3b',
} as const;

/** Point du cercle unité (rayon r, centre c) à l'angle donné, 0 = midi. */
function polar(c: number, r: number, angle: number): [number, number] {
  const a = angle - Math.PI / 2;
  return [c + r * Math.cos(a), c + r * Math.sin(a)];
}

export function AbsencePie({
  breakdown,
  labels,
  title,
  emptyLabel,
}: {
  breakdown: { justified: number; pending: number; unjustified: number };
  labels: { justified: string; pending: string; unjustified: string };
  title: string;
  emptyLabel: string;
}) {
  const slices: Slice[] = [
    { key: 'unjustified', label: labels.unjustified, value: breakdown.unjustified, color: COLORS.unjustified },
    { key: 'pending', label: labels.pending, value: breakdown.pending, color: COLORS.pending },
    { key: 'justified', label: labels.justified, value: breakdown.justified, color: COLORS.justified },
  ].filter((s) => s.value > 0);

  const total = slices.reduce((sum, s) => sum + s.value, 0);

  const SIZE = 132;
  const C = SIZE / 2;
  const R = C - 2;

  return (
    <div>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{title}</h3>
      {total === 0 ? (
        <p className="text-sm text-slate-400">{emptyLabel}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-5">
          <svg
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            role="img"
            aria-label={title}
            className="shrink-0"
          >
            {slices.length === 1 ? (
              // Une seule part : un arc de 360° est dégénéré, on trace le disque.
              <circle cx={C} cy={C} r={R} fill={slices[0]!.color} stroke="#fff" strokeWidth="2">
                <title>{`${slices[0]!.label} : ${slices[0]!.value} (100 %)`}</title>
              </circle>
            ) : (
              slices.map((s, i) => {
                const start = slices.slice(0, i).reduce((sum, p) => sum + p.value, 0) / total;
                const end = start + s.value / total;
                const a0 = start * 2 * Math.PI;
                const a1 = end * 2 * Math.PI;
                const [x0, y0] = polar(C, R, a0);
                const [x1, y1] = polar(C, R, a1);
                const largeArc = a1 - a0 > Math.PI ? 1 : 0;
                const pct = (s.value / total) * 100;
                return (
                  <path
                    key={s.key}
                    d={`M ${C} ${C} L ${x0} ${y0} A ${R} ${R} 0 ${largeArc} 1 ${x1} ${y1} Z`}
                    fill={s.color}
                    stroke="#fff"
                    strokeWidth="2"
                  >
                    <title>{`${s.label} : ${s.value} (${pct.toFixed(1)} %)`}</title>
                  </path>
                );
              })
            )}
          </svg>
          <ul className="space-y-1.5 text-sm">
            {slices.map((s) => (
              <li key={s.key} className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: s.color }}
                  aria-hidden="true"
                />
                <span className="text-slate-700">{s.label}</span>
                <span className="font-semibold tabular-nums text-slate-900">{s.value}</span>
                <span className="text-xs tabular-nums text-slate-500">
                  {((s.value / total) * 100).toFixed(1)} %
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
