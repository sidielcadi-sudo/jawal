'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

/**
 * Barre de navigation de la classe, affichée dans la bande d'en-tête de
 * **toutes** ses pages. Le bouton de la page ouverte est en bleu plein ; les
 * autres restent en contour. L'état actif est déduit de l'URL courante, ce qui
 * évite de le passer en prop depuis chaque page.
 */
export function ClassNav({
  classId,
  locale,
  isArchived = false,
}: {
  classId: string;
  locale: string;
  isArchived?: boolean;
}) {
  const pathname = usePathname();
  const t = useTranslations('admin.classes.detail');
  const base = `/${locale}/admin/classes/${classId}`;

  // `segment` vide = la page « Élèves » (la fiche de classe elle-même).
  const items: { segment: string; label: string }[] = [
    { segment: '', label: t('viewStudents') },
    { segment: '/attendance', label: t('takeAttendance') },
    { segment: '/grades', label: t('manageGrades') },
    { segment: '/grade-book', label: t('gradeBook') },
    { segment: '/timetable', label: t('timetable') },
    { segment: '/constraints', label: t('timetableConstraints') },
  ];

  // Une classe archivée ne se saisit plus : seule la liste reste consultable.
  const visible = isArchived ? items.slice(0, 1) : items;
  const current = pathname.replace(/\/$/, '');

  return (
    <nav className="flex flex-wrap items-center gap-2">
      {visible.map((it) => {
        const href = `${base}${it.segment}`;
        const active = it.segment === '' ? current === base : current.startsWith(href);
        return (
          <Link
            key={it.segment || 'root'}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              active
                ? 'bg-brand-600 text-white shadow'
                : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
