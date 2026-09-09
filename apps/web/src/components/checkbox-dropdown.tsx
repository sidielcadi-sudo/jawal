'use client';

import { useEffect, useRef, useState } from 'react';

export type CheckboxOption = { id: string; label: string };

/**
 * Menu déroulant à cases à cocher.
 *
 * Remplace le `<select multiple>` natif, dont la sélection multiple exige
 * Ctrl/Cmd+clic — un geste que personne ne devine et qui efface toute la
 * sélection au moindre clic simple.
 *
 * Convention : **rien de coché = tout afficher**. L'inverse obligerait à
 * cocher toute la liste avant de voir la moindre ligne.
 *
 * Quand `name` est fourni, la sélection est aussi émise en champs cachés :
 * le composant fonctionne alors dans un formulaire GET classique, où chaque
 * valeur cochée part comme une occurrence du même paramètre.
 */
export function CheckboxDropdown({
  options,
  selected,
  onChange,
  allLabel,
  name,
  clearLabel = 'Tout décocher',
  selectAllLabel = 'Tout cocher',
  searchPlaceholder,
  disabled = false,
}: {
  options: CheckboxOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Libellé affiché quand rien n'est coché (= aucun filtre). */
  allLabel: string;
  /** Nom du paramètre de formulaire ; omis = composant purement client. */
  name?: string;
  clearLabel?: string;
  selectAllLabel?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Fermeture au clic extérieur et à la touche Échap : un menu qui reste
  // ouvert derrière le reste de la page est vite ingérable.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  const visible = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  const summary =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? (options.find((o) => o.id === selected[0])?.label ?? `1`)
        : `${selected.length} sélectionné(s)`;

  return (
    <div ref={ref} className="relative">
      {/* Les valeurs voyagent en champs cachés : le formulaire GET parent
          continue de fonctionner sans JavaScript côté soumission. */}
      {name && selected.map((v) => <input key={v} type="hidden" name={name} value={v} />)}

      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`mt-1 flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-start text-sm shadow-sm ${
          selected.length > 0
            ? 'border-brand-400 bg-brand-50/60 text-brand-900'
            : 'border-slate-300 bg-white text-slate-700'
        } disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <span className="truncate">{summary}</span>
        <span className="shrink-0 text-slate-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-[14rem] rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
          {options.length > 8 && (
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="mb-2 w-full rounded border border-slate-300 px-2 py-1 text-xs"
            />
          )}

          <div className="max-h-56 overflow-y-auto">
            {visible.map((o) => (
              <label
                key={o.id}
                className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm text-slate-700 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(o.id)}
                  onChange={() => toggle(o.id)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <span className="truncate">{o.label}</span>
              </label>
            ))}
            {visible.length === 0 && (
              <p className="px-1.5 py-2 text-xs text-slate-400">—</p>
            )}
          </div>

          <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[11px]">
            <button
              type="button"
              onClick={() => onChange(visible.map((o) => o.id))}
              className="font-medium text-brand-700 hover:underline"
            >
              {selectAllLabel}
            </button>
            <button
              type="button"
              onClick={() => onChange([])}
              className="font-medium text-slate-500 hover:underline"
            >
              {clearLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
