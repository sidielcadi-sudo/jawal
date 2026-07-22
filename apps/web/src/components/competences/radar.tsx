import { rateColor, type DomainBreakdown } from '@/lib/competency-report';

/**
 * Radar de progression par domaine (SVG pur, rendu serveur).
 * Un axe par domaine, valeur = taux d'acquisition 0–100.
 * Les domaines non évalués sont tracés à 0 mais signalés en légende.
 */
export function CompetencyRadar({
  domains,
  size = 340,
}: {
  domains: DomainBreakdown[];
  size?: number;
}) {
  const n = domains.length;
  if (n < 3) return null; // un radar sous 3 axes n'a pas de sens

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 40; // rayon du radar
  // Marges ajoutées au viewBox pour que les libellés (ancrés autour du radar)
  // ne soient jamais rognés — horizontalement ET verticalement.
  const padX = 112;
  const padY = 36;

  /** Coupe un libellé long en 2 lignes courtes (≈ 15 caractères). */
  const wrap = (label: string): string[] => {
    const words = label.split(' ');
    let l1 = '';
    let l2 = '';
    for (const w of words) {
      if (!l2 && (`${l1} ${w}`).trim().length <= 15) l1 = `${l1} ${w}`.trim();
      else l2 = `${l2} ${w}`.trim();
    }
    return l2 ? [l1, l2] : [l1];
  };

  const pt = (i: number, frac: number) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [cx + r * frac * Math.cos(a), cy + r * frac * Math.sin(a)] as const;
  };

  const rings = [0.25, 0.5, 0.75, 1];
  const polygon = (frac: (i: number) => number) =>
    domains.map((_, i) => pt(i, frac(i)).join(',')).join(' ');

  const valuePoly = polygon((i) => (domains[i]!.rate ?? 0) / 100);
  const avg =
    domains.filter((d) => d.rate !== null).reduce((s, d) => s + d.rate!, 0) /
    Math.max(1, domains.filter((d) => d.rate !== null).length);

  return (
    <svg
      viewBox={`${-padX} ${-padY} ${size + padX * 2} ${size + padY * 2}`}
      className="mx-auto h-auto w-full max-w-[560px]"
      role="img"
    >
      {/* toile */}
      {rings.map((f) => (
        <polygon key={f} points={polygon(() => f)} fill="none" stroke="#e2e8f0" strokeWidth={1} />
      ))}
      {domains.map((_, i) => {
        const [x, y] = pt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#e2e8f0" strokeWidth={1} />;
      })}

      {/* valeurs */}
      <polygon
        points={valuePoly}
        fill={rateColor(Number.isFinite(avg) ? avg : null)}
        fillOpacity={0.22}
        stroke={rateColor(Number.isFinite(avg) ? avg : null)}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {domains.map((d, i) => {
        const [x, y] = pt(i, (d.rate ?? 0) / 100);
        return <circle key={d.id} cx={x} cy={y} r={3.5} fill={rateColor(d.rate)} />;
      })}

      {/* libellés */}
      {domains.map((d, i) => {
        const [x, y] = pt(i, 1.16);
        const anchor = Math.abs(x - cx) < 14 ? 'middle' : x > cx ? 'start' : 'end';
        const lines = wrap(d.label);
        // Ancre verticalement vers le haut pour la moitié basse du radar, afin
        // que les lignes + le % se développent sans sortir du cadre.
        const bottom = y > cy + 4;
        const startY = bottom ? y - (lines.length) * 11 : y;
        return (
          <text key={d.id} x={x} y={startY} textAnchor={anchor} className="fill-slate-500" style={{ fontSize: 10 }}>
            {lines.map((ln, k) => (
              <tspan key={k} x={x} dy={k === 0 ? 0 : 11}>
                {ln}
              </tspan>
            ))}
            <tspan x={x} dy={12} className="fill-slate-800" style={{ fontWeight: 700, fontSize: 12 }}>
              {d.rate === null ? '—' : `${Math.round(d.rate)}%`}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}

/** Barres horizontales par compétence d'un domaine. */
export function CompetencyBars({ domain }: { domain: DomainBreakdown }) {
  return (
    <ul className="space-y-1.5">
      {domain.competencies.map((c) => (
        <li key={c.id} className="flex items-center gap-2 text-sm">
          <span className="w-44 shrink-0 truncate text-slate-700" title={c.label}>
            {c.label}
          </span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
            <span
              className="block h-full rounded-full"
              style={{ width: `${c.rate ?? 0}%`, backgroundColor: rateColor(c.rate) }}
            />
          </span>
          <span className="w-20 shrink-0 text-end text-xs tabular-nums text-slate-500">
            {c.rate === null ? '—' : `${Math.round(c.rate)}%`}
            <span className="ms-1 text-slate-300">
              {c.covered}/{c.total}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
