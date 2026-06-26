/** Histogramme groupé (1 à 2 séries) — SVG statique, axes X (profs) / Y (valeurs). */
export function GroupedBars({
  data,
  series,
  unit = '',
}: {
  data: { label: string; values: (number | null)[] }[];
  series: { name: string; color: string }[]; // color = couleur hex
  unit?: string;
}) {
  const n = Math.max(1, data.length);
  const W = Math.max(360, n * (series.length > 1 ? 84 : 52) + 40);
  const H = 250;
  const padL = 34;
  const padR = 8;
  const padT = 16;
  const padB = 56;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const all = data.flatMap((d) => d.values.filter((v): v is number => v !== null));
  const rawMax = all.length ? Math.max(...all) : 1;
  const rawMin = all.length ? Math.min(...all, 0) : 0;
  const max = rawMax <= 0 ? 1 : rawMax;
  const min = Math.min(0, rawMin);
  const span = max - min || 1;
  const y = (v: number) => padT + plotH * (1 - (v - min) / span);
  const yZero = y(0);

  const groupW = plotW / n;
  const barW = Math.min(series.length > 1 ? 26 : 34, (groupW * 0.7) / series.length);
  const ticks = 4;
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => min + (span * i) / ticks);

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[250px] w-full" role="img" style={{ minWidth: W }}>
        {tickVals.map((tv, i) => (
          <g key={i}>
            <line x1={padL} y1={y(tv)} x2={W - padR} y2={y(tv)} stroke="#e2e8f0" strokeWidth="1" />
            <text x={padL - 5} y={y(tv) + 3} textAnchor="end" className="fill-slate-400 text-[9px]">
              {Math.round(tv)}
            </text>
          </g>
        ))}
        <line x1={padL} y1={yZero} x2={W - padR} y2={yZero} stroke="#94a3b8" strokeWidth="1" />

        {data.map((d, gi) => {
          const cx = padL + groupW * gi + groupW / 2;
          const total = series.length;
          return (
            <g key={gi}>
              {d.values.map((v, si) => {
                if (v === null) return null;
                const offset = (si - (total - 1) / 2) * (barW + 3);
                const x = cx + offset - barW / 2;
                const top = v >= 0 ? y(v) : yZero;
                const h = Math.abs(y(v) - yZero);
                return (
                  <g key={si}>
                    <rect x={x} y={top} width={barW} height={h} rx="2" fill={series[si]!.color} />
                    <text x={x + barW / 2} y={top - 3} textAnchor="middle" className="fill-slate-600 text-[8px] font-semibold">
                      {v.toFixed(v % 1 === 0 ? 0 : 1)}
                    </text>
                  </g>
                );
              })}
              <text x={cx} y={H - padB + 14} textAnchor="middle" className="fill-slate-500 text-[8px]">
                {d.label.length > 10 ? `${d.label.slice(0, 10)}…` : d.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex flex-wrap items-center gap-4 ps-8 text-[11px] text-slate-500">
        {series.map((s) => (
          <span key={s.name} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            {s.name}
            {unit ? ` (${unit})` : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
