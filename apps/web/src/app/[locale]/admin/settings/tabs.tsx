'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

const TABS = ['years', 'curriculum', 'subjects', 'rooms', 'fees', 'users', 'audit'] as const;
type Tab = (typeof TABS)[number];

export function SettingsTabs({ locale }: { locale: string }) {
  const pathname = usePathname();
  const t = useTranslations('admin.settings.tabs');
  const base = `/${locale}/admin/settings`;

  return (
    <nav className="-mb-px flex flex-wrap gap-1 border-b border-slate-200">
      {TABS.map((tab) => {
        const href = `${base}/${tab}`;
        const active = pathname.startsWith(href);
        return (
          <Link
            key={tab}
            href={href}
            className={[
              'border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              active
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
            ].join(' ')}
          >
            {t(tab satisfies Tab)}
          </Link>
        );
      })}
    </nav>
  );
}
