import Link from 'next/link';

const BTN =
  'inline-flex min-w-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50';
const ACTIVE =
  'inline-flex min-w-9 items-center justify-center rounded-lg border border-brand-600 bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white';

/**
 * Pagination numérotée (1 2 3 … avec liens) + flèches ‹ ›. Affiche la première,
 * la dernière, et la page courante ± 1, avec des « … » pour les sauts. `hrefFor`
 * construit l'URL d'une page (préserve les autres paramètres côté appelant).
 */
export function Pagination({
  page,
  totalPages,
  hrefFor,
}: {
  page: number;
  totalPages: number;
  hrefFor: (p: number) => string;
}) {
  if (totalPages <= 1) return null;

  // Pages à afficher : 1, dernière, et courante ± 1.
  const wanted = new Set<number>([1, totalPages]);
  for (let p = page - 1; p <= page + 1; p++) if (p >= 1 && p <= totalPages) wanted.add(p);
  const sorted = [...wanted].sort((a, b) => a - b);

  const items: (number | 'gap')[] = [];
  let prev = 0;
  for (const n of sorted) {
    if (prev && n - prev > 1) items.push('gap');
    items.push(n);
    prev = n;
  }

  return (
    <nav className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
      {page > 1 && (
        <Link href={hrefFor(page - 1)} className={BTN} aria-label="Précédent">
          ‹
        </Link>
      )}
      {items.map((it, i) =>
        it === 'gap' ? (
          <span key={`gap-${i}`} className="px-1.5 text-slate-400">
            …
          </span>
        ) : (
          <Link
            key={it}
            href={hrefFor(it)}
            aria-current={it === page ? 'page' : undefined}
            className={it === page ? ACTIVE : BTN}
          >
            {it}
          </Link>
        ),
      )}
      {page < totalPages && (
        <Link href={hrefFor(page + 1)} className={BTN} aria-label="Suivant">
          ›
        </Link>
      )}
    </nav>
  );
}
