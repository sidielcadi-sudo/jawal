/**
 * Carte d'indicateur des listes (Élèves, Enseignants, Personnel, Classes, et
 * les onglets Notes / Finances d'un élève).
 *
 * Disposition horizontale et fond teinté : empilées sur quatre hauteurs de
 * texte, les cartes poussaient le tableau sous la ligne de flottaison. La
 * teinte ne porte aucune information — elle sert seulement à distinguer les
 * cartes les unes des autres ; l'alerte reste signalée par la couleur de la
 * valeur.
 */
export type KpiTone = 'sky' | 'emerald' | 'violet' | 'red' | 'amber' | 'slate';

const CARD: Record<KpiTone, string> = {
  sky: 'border-sky-200 bg-sky-50',
  emerald: 'border-emerald-200 bg-emerald-50',
  violet: 'border-violet-200 bg-violet-50',
  red: 'border-rose-200 bg-rose-50',
  amber: 'border-amber-200 bg-amber-50',
  slate: 'border-slate-200 bg-slate-50',
};

const ICON: Record<KpiTone, string> = {
  sky: 'bg-sky-50 text-sky-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  violet: 'bg-violet-50 text-violet-700',
  red: 'bg-red-50 text-red-700',
  amber: 'bg-amber-50 text-amber-700',
  slate: 'bg-slate-100 text-slate-600',
};

export function KpiCard({
  icon,
  tone = 'slate',
  label,
  value,
  suffix,
  hint,
  alert = false,
  valueTone,
}: {
  icon: string;
  tone?: KpiTone;
  label: string;
  /** `null` quand la mesure n'a pas de source : on affiche « — », pas 0. */
  value: number | string | null;
  suffix?: string;
  hint?: string;
  alert?: boolean;
  /** Couleur imposée de la valeur (moyenne sous la barre, reste dû…). */
  valueTone?: string;
}) {
  const shown = value === null ? '—' : typeof value === 'number' ? value.toLocaleString('fr-FR') : value;
  return (
    <div className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${CARD[tone]}`}>
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/70 text-base ${ICON[tone]}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium text-slate-600">{label}</p>
        <p
          className={`text-xl font-bold leading-tight tabular-nums ${
            valueTone ?? (alert ? 'text-red-700' : 'text-slate-900')
          }`}
        >
          {shown}
          {value !== null && suffix && <span className="ms-0.5 text-sm font-normal">{suffix}</span>}
        </p>
        {hint && <p className="truncate text-[11px] text-slate-500">{hint}</p>}
      </div>
    </div>
  );
}
