'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

export function TeacherSidebar({
  locale,
  tenantName,
  teacherName,
  logoUrl,
  appelBadge = 0,
}: {
  locale: string;
  tenantName: string;
  teacherName: string;
  logoUrl?: string | null;
  appelBadge?: number;
}) {
  const pathname = usePathname();
  const t = useTranslations('enseignant.nav');
  const prefix = `/${locale}/enseignant`;

  const items = [
    { href: prefix, key: 'home', exact: true },
    { href: `${prefix}/timetable`, key: 'timetable', exact: false },
    { href: `${prefix}/appel`, key: 'appel', exact: false },
    { href: `${prefix}/cahier`, key: 'cahier', exact: false },
    { href: `${prefix}/notes`, key: 'notes', exact: false },
    { href: `${prefix}/carnet`, key: 'carnet', exact: false },
    { href: `${prefix}/classes`, key: 'classes', exact: false },
    // « Messages » retiré du menu : accessible via l'enveloppe de l'en-tête.
    { href: `${prefix}/account`, key: 'account', exact: false },
  ] as const;

  const cls = (active: boolean) =>
    [
      'block rounded-xl px-3 py-2 text-sm transition-colors',
      active
        ? 'bg-white font-semibold text-brand-700 shadow'
        : 'text-white/75 hover:bg-white/10',
    ].join(' ');

  return (
    <aside className="m-3 flex h-[calc(100vh-1.5rem)] w-60 shrink-0 flex-col rounded-3xl bg-gradient-to-b from-brand-600 to-brand-800 p-4 text-white">
      <div className="px-1.5 pb-4 pt-2">
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl ?? '/sesame-logo.png'} alt={tenantName || 'Logo'} className="h-14 w-auto object-contain" />
        </div>
        <div className="mt-2 truncate text-center text-xs text-white/60">{teacherName}</div>
      </div>
      <nav className="sidebar-scroll -me-1 flex-1 overflow-y-auto pe-1 py-1">
        <ul className="space-y-1">
          {items.map((it) => {
            const active = it.exact
              ? pathname === it.href || pathname === `${it.href}/`
              : pathname.startsWith(it.href);
            const badge = it.key === 'appel' ? appelBadge : 0;
            return (
              <li key={it.key}>
                <Link href={it.href} className={cls(active)}>
                  <span className="flex items-center justify-between gap-1.5">
                    {t(it.key)}
                    {badge > 0 && (
                      <span className="inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
                        {badge}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
