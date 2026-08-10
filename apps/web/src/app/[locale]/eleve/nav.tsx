'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

const EMOJI: Record<string, string> = {
  home: '🏠',
  timetable: '📅',
  cahier: '📓',
  notes: '📝',
  bulletins: '🧾',
  carnet: '📒',
  announcements: '📢',
  account: '👤',
};

export function StudentSidebar({
  locale,
  studentName,
  className,
}: {
  locale: string;
  studentName: string;
  className: string | null;
}) {
  const pathname = usePathname();
  const t = useTranslations('eleve.nav');
  const prefix = `/${locale}/eleve`;
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(localStorage.getItem('jawal-sidebar-collapsed') === '1');
  }, []);
  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem('jawal-sidebar-collapsed', next ? '1' : '0');
      } catch {
        /* stockage indisponible */
      }
      return next;
    });
  }

  const items = [
    { key: 'home', href: prefix, exact: true },
    { key: 'timetable', href: `${prefix}/timetable`, exact: false },
    { key: 'cahier', href: `${prefix}/cahier`, exact: false },
    { key: 'notes', href: `${prefix}/notes`, exact: false },
    { key: 'bulletins', href: `${prefix}/bulletins`, exact: false },
    { key: 'carnet', href: `${prefix}/carnet`, exact: false },
    { key: 'announcements', href: `${prefix}/announcements`, exact: false },
    { key: 'account', href: `${prefix}/account`, exact: false },
  ] as const;

  const linkCls = (active: boolean) =>
    [
      'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors',
      collapsed ? 'justify-center' : '',
      active ? 'bg-white font-semibold text-brand-700 shadow' : 'text-white/75 hover:bg-white/10',
    ].join(' ');

  return (
    <aside
      className={`m-3 flex h-[calc(100vh-1.5rem)] shrink-0 flex-col rounded-3xl bg-gradient-to-b from-brand-600 to-brand-800 p-3 text-white transition-[width] duration-200 ${
        collapsed ? 'w-[4.75rem]' : 'w-60'
      }`}
    >
      {/* Le logo de l'établissement est affiché à gauche de la bande d'en-tête. */}
      <div className={`mb-2 flex items-center px-1 ${collapsed ? 'justify-center' : 'justify-end'}`}>
        <button
          type="button"
          onClick={toggle}
          title={collapsed ? 'Développer le menu' : 'Réduire le menu'}
          aria-label={collapsed ? 'Développer le menu' : 'Réduire le menu'}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/80 hover:bg-white/10"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={collapsed ? 'rotate-180' : ''}
            aria-hidden="true"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </div>
      {!collapsed && (
        <div className="mb-2 rounded-2xl bg-white/10 px-3 py-2.5">
          <div className="truncate text-sm font-semibold text-white">{studentName}</div>
          {className && <div className="truncate text-xs text-white/60">{className}</div>}
        </div>
      )}
      <nav className="sidebar-scroll -me-1 flex-1 overflow-y-auto overflow-x-hidden pe-1 py-1">
        <ul className="space-y-1">
          {items.map((it) => (
            <li key={it.key}>
              <Link
                href={it.href}
                title={collapsed ? t(it.key) : undefined}
                className={linkCls(
                  it.exact ? pathname === it.href || pathname === `${it.href}/` : pathname.startsWith(it.href),
                )}
              >
                <span className="w-5 shrink-0 text-center text-base leading-none">
                  {EMOJI[it.key]}
                </span>
                {!collapsed && <span className="flex-1 truncate">{t(it.key)}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
