'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

const EMOJI: Record<string, string> = {
  home: '🏠',
  timetable: '📅',
  appel: '✅',
  cahier: '📓',
  notes: '📝',
  competences: '🎯',
  soutien: '📚',
  carnet: '📒',
  classes: '🏫',
  leave: '🌴',
  announcements: '📢',
  account: '👤',
};

export function TeacherSidebar({
  locale,
  appelBadge = 0,
}: {
  locale: string;
  appelBadge?: number;
}) {
  const pathname = usePathname();
  const t = useTranslations('enseignant.nav');
  const prefix = `/${locale}/enseignant`;
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
    { href: prefix, key: 'home', exact: true },
    { href: `${prefix}/timetable`, key: 'timetable', exact: false },
    { href: `${prefix}/appel`, key: 'appel', exact: false },
    { href: `${prefix}/carnet`, key: 'carnet', exact: false },
    { href: `${prefix}/cahier`, key: 'cahier', exact: false },
    { href: `${prefix}/notes`, key: 'notes', exact: false },
    { href: `${prefix}/competences`, key: 'competences', exact: false },
    { href: `${prefix}/soutien`, key: 'soutien', exact: false },
    { href: `${prefix}/classes`, key: 'classes', exact: false },
    { href: `${prefix}/leave`, key: 'leave', exact: false },
    { href: `${prefix}/announcements`, key: 'announcements', exact: false },
    // « Messages » retiré du menu : accessible via l'enveloppe de l'en-tête.
    { href: `${prefix}/account`, key: 'account', exact: false },
  ] as const;

  const cls = (active: boolean) =>
    [
      'relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors',
      collapsed ? 'justify-center' : '',
      active ? 'bg-white font-semibold text-brand-700 shadow' : 'text-white/75 hover:bg-white/10',
    ].join(' ');

  return (
    <aside
      className={`m-3 flex h-[calc(100vh-1.5rem)] shrink-0 flex-col rounded-3xl bg-gradient-to-b from-brand-600 to-brand-800 p-3 text-white transition-[width] duration-200 ${
        collapsed ? 'w-[4.75rem]' : 'w-60'
      }`}
    >
      {/* En-tête : bouton réduire / agrandir seul. L'avatar du professeur a
          été retiré ; son identité figure déjà dans la bande d'en-tête. */}
      <div
        className={`mb-2 flex items-center px-1 ${collapsed ? 'justify-center' : 'justify-end'}`}
      >
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
      <nav className="sidebar-scroll -me-1 flex-1 overflow-y-auto overflow-x-hidden pe-1 py-1">
        <ul className="space-y-1">
          {items.map((it) => {
            const active = it.exact
              ? pathname === it.href || pathname === `${it.href}/`
              : pathname.startsWith(it.href);
            const badge = it.key === 'appel' ? appelBadge : 0;
            return (
              <li key={it.key}>
                <Link
                  href={it.href}
                  title={collapsed ? t(it.key) : undefined}
                  className={cls(active)}
                >
                  <span className="w-5 shrink-0 text-center text-base leading-none">
                    {EMOJI[it.key]}
                  </span>
                  {!collapsed && <span className="flex-1 truncate">{t(it.key)}</span>}
                  {!collapsed && badge > 0 && (
                    <span className="inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
                      {badge}
                    </span>
                  )}
                  {collapsed && badge > 0 && (
                    <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-600" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
