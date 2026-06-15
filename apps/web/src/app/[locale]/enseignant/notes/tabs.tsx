'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

const TABS = ['saisie', 'releve', 'appreciations', 'graphes'] as const;

export function NotesTabs({ locale }: { locale: string }) {
  const pathname = usePathname();
  const t = useTranslations('enseignant.notes.tabs');
  const base = `/${locale}/enseignant/notes`;

  return (
    <nav className="flex flex-wrap gap-1 border-b border-slate-200">
      {TABS.map((tab) => {
        const href = tab === 'saisie' ? base : `${base}/${tab}`;
        const active =
          tab === 'saisie'
            ? pathname === base || pathname === `${base}/`
            : pathname.startsWith(href);
        return (
          <Link
            key={tab}
            href={href}
            className={[
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              active
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
            ].join(' ')}
          >
            {t(tab)}
          </Link>
        );
      })}
    </nav>
  );
}
