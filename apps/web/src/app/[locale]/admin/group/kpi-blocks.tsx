import type { ReactNode } from 'react';

/**
 * Briques du tableau de bord Groupe, reprises de la maquette SAHL.
 *
 * Toutes rendent `—` quand la donnée n'existe pas, jamais 0 : sur un tableau
 * de bord de direction, un zéro se lit comme une mesure et déclenche des
 * décisions. « Pas de donnée » et « zéro » ne disent pas la même chose.
 */

export function Card({
  title,
  icon,
  right,
  children,
  className = '',
}: {
  title: string;
  icon?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-brand-200 bg-white p-4 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
          {icon && <span aria-hidden>{icon}</span>}
          {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

/** Carte d'indicateur : une grande valeur, deux mentions dessous. */
export function BigKpi({
  title,
  icon,
  value,
  unit,
  tone = 'brand',
  subs,
}: {
  title: string;
  icon: string;
  value: string;
  unit?: string;
  tone?: 'brand' | 'emerald' | 'amber' | 'red';
  subs?: ReactNode;
}) {
  const valueTone: Record<string, string> = {
    brand: 'text-brand-800',
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
    red: 'text-red-700',
  };
  const iconTone: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
  };
  return (
    <section className="rounded-2xl border border-brand-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-slate-700">{title}</h2>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-base ${iconTone[tone]}`}>
          {icon}
        </span>
      </div>
      <p className={`mt-2 text-3xl font-extrabold tabular-nums ${valueTone[tone]}`}>
        {value}
        {unit && <span className="ms-1 text-sm font-normal text-slate-500">{unit}</span>}
      </p>
      {subs && <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">{subs}</div>}
    </section>
  );
}

/** Carte d'un établissement : quatre mesures en quadrillage. */
export function SiteCard({
  name,
  headcount,
  color,
  stats,
}: {
  name: string;
  headcount: string;
  color: string;
  stats: Array<{ label: string; value: string; tone?: 'good' | 'warn' | 'bad' }>;
}) {
  const tone: Record<string, string> = {
    good: 'text-emerald-700',
    warn: 'text-amber-700',
    bad: 'text-red-700',
  };
  return (
    <div
      className="rounded-xl border border-slate-200 bg-white p-3"
      style={{ borderInlineStartWidth: 4, borderInlineStartColor: color }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <strong className="truncate text-sm text-slate-900">{name}</strong>
        <span className="shrink-0 text-xs text-slate-500">{headcount}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg bg-slate-50 px-2.5 py-1.5">
            <div className="text-[11px] text-slate-500">{s.label}</div>
            <div className={`text-base font-bold tabular-nums ${s.tone ? tone[s.tone] : 'text-slate-900'}`}>
              {s.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Barres horizontales avec libellé et valeur à droite. */
export function BarList({
  rows,
  max,
  marker,
  markerLabel,
}: {
  rows: Array<{ label: string; value: number | null; display: string; color: string }>;
  /** Échelle. Par défaut, le plus grand des `value`. */
  max?: number;
  /** Repère vertical (un objectif, par exemple), en unité des valeurs. */
  marker?: number;
  markerLabel?: string;
}) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value ?? 0));
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex items-baseline justify-between gap-2 text-xs font-medium">
            <span className="truncate text-slate-700">{r.label}</span>
            <span className="shrink-0 tabular-nums text-slate-600">{r.display}</span>
          </div>
          <div className="relative mt-1 h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(0, Math.min(100, ((r.value ?? 0) / top) * 100))}%`,
                backgroundColor: r.color,
              }}
            />
            {marker !== undefined && (
              <span
                title={markerLabel}
                className="absolute inset-y-0 w-px bg-slate-900/50"
                style={{ insetInlineStart: `${Math.min(100, (marker / top) * 100)}%` }}
              />
            )}
          </div>
        </div>
      ))}
      {marker !== undefined && markerLabel && (
        <p className="text-[11px] text-slate-400">{markerLabel}</p>
      )}
    </div>
  );
}

/**
 * Jauge circulaire en dégradé conique — la même figure que la maquette, sans
 * librairie : un simple `conic-gradient` masqué en son centre.
 */
export function Gauge({ value, label, hint }: { value: number | null; label: string; hint: string }) {
  const v = value ?? 0;
  return (
    <div className="flex items-center gap-3">
      <div
        className="grid h-[74px] w-[74px] shrink-0 place-items-center rounded-full"
        style={{
          backgroundImage: `conic-gradient(rgb(var(--brand-600, 37 99 235)) 0% ${v}%, #e2e8f0 ${v}% 100%)`,
        }}
      >
        <span className="grid h-[54px] w-[54px] place-items-center rounded-full bg-white text-sm font-extrabold tabular-nums text-brand-800">
          {value === null ? '—' : `${value}%`}
        </span>
      </div>
      <div className="min-w-0">
        <strong className="block text-sm text-slate-800">{label}</strong>
        <p className="text-[11px] text-slate-500">{hint}</p>
      </div>
    </div>
  );
}

/** Mini-histogramme d'évolution, sans axe : on y lit une tendance. */
export function Sparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(1, ...values);
  return (
    <div className="mt-1 flex h-8 items-end gap-1">
      {values.map((v, i) => (
        <span
          key={i}
          className="flex-1 rounded-sm"
          style={{ height: `${Math.max(6, (v / max) * 100)}%`, backgroundColor: color }}
        />
      ))}
    </div>
  );
}

/** Chiffre du mois + tendance, colonne de droite du bloc « Vie scolaire ». */
export function TrendStat({
  label,
  value,
  values,
  color,
  tone = 'text-slate-900',
}: {
  label: string;
  value: string;
  values: number[];
  color: string;
  tone?: string;
}) {
  return (
    <div className="min-w-[110px]">
      <span className="text-xs text-slate-500">{label}</span>
      <div className={`text-lg font-bold tabular-nums ${tone}`}>{value}</div>
      <Sparkline values={values} color={color} />
    </div>
  );
}

/** Tuile d'infrastructure : une icône, un taux, un libellé. */
export function LogTile({
  icon,
  value,
  label,
  tone,
}: {
  icon: string;
  value: string;
  label: string;
  tone: 'good' | 'warn' | 'bad' | 'none';
}) {
  const color: Record<string, string> = {
    good: 'text-emerald-700',
    warn: 'text-amber-700',
    bad: 'text-red-700',
    none: 'text-slate-400',
  };
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-3 text-center">
      <div className="text-lg" aria-hidden>
        {icon}
      </div>
      <div className={`mt-1 text-base font-bold tabular-nums ${color[tone]}`}>{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  );
}

/** Seuils communs aux tuiles et aux cartes de site. */
export function rateTone(v: number | null, good = 90, warn = 75): 'good' | 'warn' | 'bad' | 'none' {
  if (v === null) return 'none';
  if (v >= good) return 'good';
  if (v >= warn) return 'warn';
  return 'bad';
}
