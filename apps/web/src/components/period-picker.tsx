'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { localizedLabel } from '@/lib/localized-name';

export type PeriodOpt = { id: string; label: string; labelAr?: string | null };

/**
 * Sélecteur de période : une liste déroulante et un bouton « Voir ».
 *
 * Une ligne de boutons devenait illisible dès qu'un écran empilait déjà
 * d'autres filtres (classe, matière, élève) ; le déroulant tient sur une
 * largeur fixe quel que soit le nombre de périodes. La navigation n'a lieu
 * qu'au clic sur « Voir » : on peut changer d'avis sans déclencher un
 * rechargement à chaque frappe.
 *
 * Les autres paramètres d'URL sont conservés — sans quoi changer de trimestre
 * remettrait à zéro le reste du filtrage.
 */
export function PeriodPicker({
  periods,
  selectedId,
  locale,
  paramName = 'period',
  allLabel,
}: {
  periods: PeriodOpt[];
  selectedId: string | null;
  locale: string;
  /** Nom du paramètre d'URL, si l'écran n'utilise pas `period`. */
  paramName?: string;
  /** Ajoute une option « toutes périodes » qui retire le paramètre. */
  allLabel?: string;
}) {
  const t = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [value, setValue] = useState(selectedId ?? '');

  // Un retour arrière ou un lien externe peut changer la période sans passer
  // par ce composant : on resynchronise sur l'URL.
  useEffect(() => setValue(selectedId ?? ''), [selectedId]);

  if (periods.length === 0) return null;

  const submit = () => {
    const q = new URLSearchParams(search?.toString() ?? '');
    if (value) q.set(paramName, value);
    else q.delete(paramName);
    const qs = q.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-slate-500">{t('period')}</span>
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
      >
        {allLabel && <option value="">{allLabel}</option>}
        {periods.map((p) => (
          <option key={p.id} value={p.id}>
            {localizedLabel(locale, p.label, p.labelAr ?? null)}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={submit}
        className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
      >
        {t('view')}
      </button>
    </div>
  );
}
