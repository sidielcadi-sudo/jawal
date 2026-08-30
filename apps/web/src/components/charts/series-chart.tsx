'use client';

import { useState } from 'react';

/**
 * Graphique à séries mixtes — barres groupées, barres empilées et courbes sur
 * une même échelle, avec une légende cliquable pour masquer/afficher chaque
 * série.
 *
 * Géométrie et typographie calquées sur l'histogramme de Finances › Revenus &
 * encaissements (1000×300, grille #e2e8f0, graduations 9 px) : tous les
 * diagrammes de l'application se lisent ainsi de la même façon.
 *
 * Empilement : les séries qui partagent le même `stack` s'empilent ; deux
 * `stack` différents se placent côte à côte dans le créneau du mois. Une série
 * `line` est tracée par-dessus, sur la même échelle — utile pour un taux
 * exprimé en pourcentage quand `yMax` vaut 100.
 */
export type ChartSeries = {
  key: string;
  name: string;
  color: string;
  values: (number | null)[];
  /** 'bar' par défaut. */
  type?: 'bar' | 'line';
  /** Identifiant de pile ; les barres sans `stack` sont chacune leur pile. */
  stack?: string;
  /** Trait discontinu (objectif, seuil). */
  dashed?: boolean;
};

export function SeriesChart({
  labels,
  series,
  format,
  formatValue,
  yMax,
  emptyLabel,
}: {
  labels: string[];
  series: ChartSeries[];
  /** Graduations de l'axe — volontairement compactes (12k, 1,2M…). */
  format: (n: number) => string;
  /** Info-bulle ; à défaut, `format`. Sert à donner la valeur exacte. */
  formatValue?: (n: number) => string;
  yMax?: number;
  emptyLabel: string;
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const tip = formatValue ?? format;
  const shown = series.filter((s) => !hidden.has(s.key));
  const bars = shown.filter((s) => (s.type ?? 'bar') === 'bar');
  const lines = shown.filter((s) => s.type === 'line');

  // Piles : ordre d'apparition, pour que la position d'un établissement dans
  // le créneau ne bouge pas quand on masque une catégorie.
  const stackIds: string[] = [];
  for (const s of bars) {
    const id = s.stack ?? s.key;
    if (!stackIds.includes(id)) stackIds.push(id);
  }

  const W = 1000;
  const H = 300;
  const padL = 48;
  const padR = 8;
  const padT = 12;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const baseY = padT + plotH;

  // Le maximum tient compte de l'empilement : c'est la somme par pile.
  let peak = 0;
  for (let i = 0; i < labels.length; i++) {
    for (const id of stackIds) {
      const sum = bars
        .filter((s) => (s.stack ?? s.key) === id)
        .reduce((acc, s) => acc + Math.max(0, s.values[i] ?? 0), 0);
      peak = Math.max(peak, sum);
    }
    for (const l of lines) peak = Math.max(peak, l.values[i] ?? 0);
  }
  const max = yMax ?? niceMax(peak);
  const hasData = shown.some((s) => s.values.some((v) => v !== null && v !== 0));

  const slotW = plotW / Math.max(1, labels.length);
  const yFor = (v: number) => baseY - (v / max) * plotH;
  const hFor = (v: number) => (v / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);

  const innerGap = 1.5;
  const groupW = Math.min(slotW * 0.62, 260);
  const barW = Math.max(1, (groupW - innerGap * (stackIds.length - 1)) / Math.max(1, stackIds.length));
  const slotCx = (i: number) => padL + slotW * (i + 0.5);

  return (
    <div className="w-full">
      {!hasData ? (
        <p className="py-10 text-center text-sm text-slate-400">{emptyLabel}</p>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          className="aspect-[10/3] w-full"
          role="img"
        >
          {ticks.map((tk, i) => {
            const y = yFor(tk);
            return (
              <g key={i}>
                <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#e2e8f0" strokeWidth={1} />
                <text x={padL - 6} y={y + 3} textAnchor="end" fontSize={9} fill="#94a3b8">
                  {format(tk)}
                </text>
              </g>
            );
          })}
          <line x1={padL} y1={padT} x2={padL} y2={baseY} stroke="#cbd5e1" strokeWidth={1} />
          <line x1={padL} y1={baseY} x2={W - padR} y2={baseY} stroke="#cbd5e1" strokeWidth={1} />

          {labels.map((label, i) => {
            const startX = slotCx(i) - groupW / 2;
            return (
              <g key={label + i}>
                {stackIds.map((id, si) => {
                  const inStack = bars.filter((s) => (s.stack ?? s.key) === id);
                  let acc = 0;
                  return inStack.map((s) => {
                    const v = s.values[i];
                    if (v === null || v === undefined || v <= 0) return null;
                    const y = yFor(acc + v);
                    acc += v;
                    return (
                      <rect
                        key={s.key}
                        x={startX + si * (barW + innerGap)}
                        y={y}
                        width={barW}
                        height={hFor(v)}
                        rx={1.5}
                        fill={s.color}
                      >
                        <title>{`${s.name} — ${label} : ${tip(v)}`}</title>
                      </rect>
                    );
                  });
                })}
                <text
                  x={slotCx(i)}
                  y={baseY + 14}
                  textAnchor="middle"
                  fontSize={9}
                  fill="#64748b"
                  className="capitalize"
                >
                  {label}
                </text>
              </g>
            );
          })}

          {lines.map((s) => {
            const pts = s.values
              .map((v, i) => (v === null ? null : `${slotCx(i)},${yFor(v)}`))
              .filter((p): p is string => p !== null);
            if (pts.length === 0) return null;
            return (
              <g key={s.key}>
                <polyline
                  points={pts.join(' ')}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeDasharray={s.dashed ? '6 4' : undefined}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {!s.dashed &&
                  s.values.map((v, i) =>
                    v === null ? null : (
                      <circle key={i} cx={slotCx(i)} cy={yFor(v)} r={3.5} fill={s.color} stroke="#fff" strokeWidth={1.5}>
                        <title>{`${s.name} — ${labels[i]} : ${tip(v)}`}</title>
                      </circle>
                    ),
                  )}
              </g>
            );
          })}
        </svg>
      )}

      <ul className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
        {series.map((s) => {
          const off = hidden.has(s.key);
          return (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => toggle(s.key)}
                aria-pressed={!off}
                className={`flex items-center gap-2 rounded px-1.5 py-0.5 text-xs transition-colors ${
                  off ? 'text-slate-400 line-through' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: off ? '#cbd5e1' : s.color }}
                  aria-hidden
                />
                {s.name}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / mag) * mag;
}
