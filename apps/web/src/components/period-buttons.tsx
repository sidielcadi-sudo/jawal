'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { localizedLabel } from '@/lib/localized-name';

export type PeriodOpt = { id: string; label: string; labelAr?: string | null };

/**
 * Sélecteur de période sous forme de boutons — un par trimestre ou semestre,
 * le courant en plein bleu.
 *
 * Remplace partout la liste déroulante + bouton « Appliquer » : le choix est
 * immédiat, et les trois périodes tiennent sur une ligne. Les autres
 * paramètres d'URL sont conservés (classe, matière, élève…), sans quoi changer
 * de trimestre remettrait à zéro le reste du filtrage.
 */
export function PeriodButtons({
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
  /** Ajoute un bouton « toutes périodes » qui retire le paramètre. */
  allLabel?: string;
}) {
  const t = useTranslations('common');
  const pathname = usePathname();
  const search = useSearchParams();
  if (periods.length === 0) return null;

  const hrefFor = (id: string | null) => {
    const q = new URLSearchParams(search?.toString() ?? '');
    if (id) q.set(paramName, id);
    else q.delete(paramName);
    const qs = q.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };
  const btn = (active: boolean) =>
    `whitespace-nowrap rounded-lg px-3 py-1 text-xs font-medium ${
      active
        ? 'bg-brand-600 text-white'
        : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
    }`;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-slate-500">{t('period')}</span>
      {allLabel && (
        <Link href={hrefFor(null)} className={btn(!selectedId)}>
          {allLabel}
        </Link>
      )}
      {periods.map((p) => (
        <Link key={p.id} href={hrefFor(p.id)} className={btn(selectedId === p.id)}>
          {localizedLabel(locale, p.label, p.labelAr ?? null)}
        </Link>
      ))}
    </div>
  );
}
