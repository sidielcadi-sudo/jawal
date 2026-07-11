'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

export function StudentSidebar({
  locale,
  tenantName,
  studentName,
  className,
  logoUrl,
}: {
  locale: string;
  tenantName: string;
  studentName: string;
  className: string | null;
  logoUrl?: string | null;
}) {
  const pathname = usePathname();
  const t = useTranslations('eleve.nav');
  const prefix = `/${locale}/eleve`;

  const items = [
    { key: 'home', href: prefix, exact: true },
    { key: 'timetable', href: `${prefix}/timetable` },
    { key: 'cahier', href: `${prefix}/cahier` },
    { key: 'notes', href: `${prefix}/notes` },
    { key: 'bulletins', href: `${prefix}/bulletins` },
    { key: 'carnet', href: `${prefix}/carnet` },
    { key: 'announcements', href: `${prefix}/announcements` },
    { key: 'account', href: `${prefix}/account` },
  ];

  const linkCls = (active: boolean) =>
    [
      'flex items-center rounded-xl px-3 py-2.5 text-sm transition-colors',
      active
        ? 'bg-white font-semibold text-brand-700 shadow'
        : 'text-white/75 hover:bg-white/10',
    ].join(' ');

  return (
    <aside className="m-3 flex h-[calc(100vh-1.5rem)] w-60 shrink-0 flex-col rounded-3xl bg-gradient-to-b from-brand-600 to-brand-800 p-4 text-white">
      <div className="flex justify-center px-1.5 pb-4 pt-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl ?? '/sesame-logo.png'} alt={tenantName || 'Logo'} className="h-14 w-auto object-contain" />
      </div>
      <div className="mb-2 rounded-2xl bg-white/10 px-3 py-2.5">
        <div className="truncate text-sm font-semibold text-white">{studentName}</div>
        {className && <div className="truncate text-xs text-white/60">{className}</div>}
      </div>
      <nav className="sidebar-scroll -me-1 flex-1 overflow-y-auto pe-1 py-1">
        <ul className="space-y-1">
          {items.map((it) => (
            <li key={it.key}>
              <Link
                href={it.href}
                className={linkCls(
                  it.exact ? pathname === it.href || pathname === `${it.href}/` : pathname.startsWith(it.href),
                )}
              >
                {t(it.key)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
