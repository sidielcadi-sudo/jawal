import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

/**
 * Fil d'Ariane des pages d'une classe : Classes › 2BAC-SM-A › Groupes.
 *
 * Les sous-pages (groupes, carnet, appel, emploi du temps…) portaient bien la
 * barre `ClassNav`, mais celle-ci ne circule qu'entre les onglets de la classe :
 * une fois dedans, aucun chemin ne ramenait à la liste ni à la fiche. Le fil
 * est ici plutôt que recopié dans chaque page, pour qu'elles ne divergent pas.
 */
export async function ClassCrumb({
  locale,
  classId,
  className,
  current,
}: {
  locale: string;
  classId: string;
  className: string;
  /** Libellé de la page ouverte. Absent = on est sur la fiche elle-même. */
  current?: string;
}) {
  const t = await getTranslations('admin.classes');
  const base = `/${locale}/admin/classes`;

  return (
    <nav className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
      <Link href={base} className="hover:text-brand-700 hover:underline">
        {t('title')}
      </Link>
      <span aria-hidden>›</span>
      {current ? (
        <>
          <Link href={`${base}/${classId}`} className="hover:text-brand-700 hover:underline">
            {className}
          </Link>
          <span aria-hidden>›</span>
          <span className="font-medium text-slate-700">{current}</span>
        </>
      ) : (
        <span className="font-medium text-slate-700">{className}</span>
      )}
    </nav>
  );
}
