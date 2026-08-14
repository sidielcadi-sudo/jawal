/**
 * Graphiques de la vue groupe — SVG rendus côté serveur, sans librairie ni JS
 * client (mêmes contraintes que le camembert des absences).
 *
 * Règles suivies :
 *  - **La couleur suit l'établissement, jamais son rang.** `SITE_COLORS` est
 *    attribué une fois par site et réutilisé dans tous les graphiques : un
 *    site garde sa couleur même si l'ordre ou le nombre de sites change.
 *  - Palette catégorielle de 3 teintes validées comme discernables entre
 *    elles, y compris en vision daltonienne.
 *  - Une seule échelle par graphique — jamais deux axes Y : les montants et
 *    les taux sont deux graphiques distincts.
 *  - Traits fins, grille en filet discret, légende systématique, valeurs au
 *    survol via `<title>` natif.
 */

/** Palette catégorielle — ordre fixe, assignée par site. */
const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#4a3aa7'];

export function siteColors(names: string[]): Record<string, string> {
  return Object.fromEntries(names.map((n, i) => [n, PALETTE[i % PALETTE.length]!]));
}

export type Series = { name: string; values: (number | null)[] };

const INK = '#52514e';
const MUTED = '#898781';
const GRID = '#e1e0d9';

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / mag) * mag;
}

/* ── Courbes (évolution mensuelle) ──────────────────────────────────────── */

export function LineChart({
  labels,
  series,
  colors,
  format,
  yMin = 0,
  yMax,
  title,
  emptyLabel,
}: {
  labels: string[];
  series: Series[];
  colors: Record<string, string>;
  format: (n: number) => string;
  yMin?: number;
  yMax?: number;
  title: string;
  emptyLabel: string;
}) {
  const flat = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const hasData = flat.length > 0;

  const W = 720;
  const H = 300;
  const PAD = { top: 12, right: 16, bottom: 34, left: 68 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const max = yMax ?? niceMax(Math.max(...(hasData ? flat : [1])));
  const min = yMin;
  const x = (i: number) => PAD.left + (labels.length === 1 ? plotW / 2 : (i / (labels.length - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - ((v - min) / (max - min)) * plotH;

  const ticks = Array.from({ length: 5 }, (_, i) => min + ((max - min) * i) / 4);

  return (
    <figure className="rounded-2xl border border-brand-200 bg-white p-4">
      <figcaption className="mb-3 text-sm font-semibold text-slate-800">{title}</figcaption>
      {!hasData ? (
        <p className="py-10 text-center text-sm text-slate-400">{emptyLabel}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[540px]" role="img" aria-label={title}>
              {ticks.map((tv) => (
                <g key={tv}>
                  <line x1={PAD.left} x2={W - PAD.right} y1={y(tv)} y2={y(tv)} stroke={GRID} strokeWidth="1" />
                  <text x={PAD.left - 8} y={y(tv) + 4} textAnchor="end" fontSize="11" fill={MUTED}>
                    {format(tv)}
                  </text>
                </g>
              ))}

              {labels.map((l, i) => (
                <text key={l + i} x={x(i)} y={H - 12} textAnchor="middle" fontSize="11" fill={MUTED}>
                  {l}
                </text>
              ))}

              {series.map((s) => {
                const pts = s.values
                  .map((v, i) => (v === null ? null : `${x(i)},${y(v)}`))
                  .filter((p): p is string => p !== null);
                if (pts.length === 0) return null;
                return (
                  <g key={s.name}>
                    <polyline
                      points={pts.join(' ')}
                      fill="none"
                      stroke={colors[s.name]}
                      strokeWidth="2"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                    {s.values.map((v, i) =>
                      v === null ? null : (
                        <circle key={i} cx={x(i)} cy={y(v)} r="4" fill={colors[s.name]} stroke="#fff" strokeWidth="1.5">
                          <title>{`${s.name} · ${labels[i]} : ${format(v)}`}</title>
                        </circle>
                      ),
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
          <Legend series={series.map((s) => s.name)} colors={colors} />
        </>
      )}
    </figure>
  );
}

/* ── Barres (comparaison entre établissements) ──────────────────────────── */

export function BarChart({
  rows,
  colors,
  format,
  max: forcedMax,
  title,
  emptyLabel,
}: {
  rows: { name: string; value: number | null }[];
  colors: Record<string, string>;
  format: (n: number) => string;
  max?: number;
  title: string;
  emptyLabel: string;
}) {
  const known = rows.filter((r): r is { name: string; value: number } => r.value !== null);
  if (known.length === 0) {
    return (
      <figure className="rounded-2xl border border-brand-200 bg-white p-4">
        <figcaption className="mb-3 text-sm font-semibold text-slate-800">{title}</figcaption>
        <p className="py-10 text-center text-sm text-slate-400">{emptyLabel}</p>
      </figure>
    );
  }
  const max = forcedMax ?? niceMax(Math.max(...known.map((r) => r.value)));

  return (
    <figure className="rounded-2xl border border-brand-200 bg-white p-4">
      <figcaption className="mb-3 text-sm font-semibold text-slate-800">{title}</figcaption>
      {/* Barres horizontales : les noms d'établissement se lisent sans rotation. */}
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.name}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-slate-700">{r.name}</span>
              <span className="shrink-0 font-semibold tabular-nums text-slate-900">
                {r.value === null ? '—' : format(r.value)}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${r.value === null ? 0 : Math.max(1, (r.value / max) * 100)}%`,
                  backgroundColor: colors[r.name],
                }}
                title={r.value === null ? undefined : `${r.name} : ${format(r.value)}`}
              />
            </div>
          </li>
        ))}
      </ul>
    </figure>
  );
}

function Legend({ series, colors }: { series: string[]; colors: Record<string, string> }) {
  return (
    <ul className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5">
      {series.map((s) => (
        <li key={s} className="flex items-center gap-2 text-xs" style={{ color: INK }}>
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: colors[s] }}
            aria-hidden="true"
          />
          {s}
        </li>
      ))}
    </ul>
  );
}
