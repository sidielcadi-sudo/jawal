'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

const TABS = [
  { key: 'cockpit', seg: '' },
  { key: 'board', seg: '/journee' },
] as const;

export function VieScolaireTabs({ locale }: { locale: string }) {
  const pathname = usePathname();
  const t = useTranslations('admin.vieScolaire.board.tabs');
  const base = `/${locale}/admin/vie-scolaire`;

  return (
    <nav className="-mb-px flex flex-wrap gap-1 border-b border-slate-200">
      {TABS.map((tab) => {
        const href = `${base}${tab.seg}`;
        const active = tab.seg === '' ? pathname === base : pathname.startsWith(href);
        return (
          <Link
            key={tab.key}
            href={href}
            className={[
              'border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              active
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
            ].join(' ')}
          >
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}
