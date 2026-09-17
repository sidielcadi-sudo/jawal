'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Choix du trimestre, partagé par les écrans Notes et Absences de l'élève.
 *
 * Le trimestre passe par l'URL et non par un état local : « les maths de Badr
 * au 2ᵉ trimestre » doit tenir dans un lien, et survivre à un rechargement.
 */
export function PeriodTabs({
  periods,
  current,
}: {
  periods: Array<{ id: string; label: string }>;
  current: string;
}) {
  const pathname = usePathname();
  const search = useSearchParams();

  if (periods.length <= 1) return null;

  const href = (id: string) => {
    const qs = new URLSearchParams(search.toString());
    qs.set('period', id);
    return `${pathname}?${qs.toString()}`;
  };

  return (
    <nav className="mt-4 flex flex-wrap gap-2">
      {periods.map((p) => (
        <Link
          key={p.id}
          href={href(p.id)}
          aria-current={p.id === current ? 'page' : undefined}
          className={
            p.id === current
              ? 'rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow'
              : 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50'
          }
        >
          {p.label}
        </Link>
      ))}
    </nav>
  );
}
