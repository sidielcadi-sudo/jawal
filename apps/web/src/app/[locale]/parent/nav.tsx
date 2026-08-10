'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

type Child = {
  id: string;
  firstName: string;
  lastName: string;
  className: string | null;
  unread?: number;
  pendingFees?: number;
};

// « bourse » retiré des sections par enfant : une entrée unique agrégée est
// exposée dans la section générale (/parent/bourse).
const CHILD_SECTIONS = ['cahier', 'notes', 'vie-scolaire', 'scolarite', 'documents'] as const;

const SECTION_EMOJI: Record<string, string> = {
  cahier: '📓',
  notes: '📝',
  'vie-scolaire': '📅',
  scolarite: '💰',
  documents: '📄',
};
const GENERAL_EMOJI: Record<string, string> = {
  announcements: '📢',
  bourse: '📖',
  surveys: '🗳️',
  account: '👤',
};

export function ParentSidebar({
  locale,
  children,
}: {
  locale: string;
  children: Child[];
}) {
  const pathname = usePathname();
  const t = useTranslations('parent.nav');
  const prefix = `/${locale}/parent`;
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

  // Enfant actif déduit de l'URL : /parent/children/{id}/...
  const m = pathname.match(/\/parent\/children\/([^/]+)/);
  const activeChildId = m?.[1] ?? null;
  const activeSection = CHILD_SECTIONS.find((s) =>
    pathname.includes(`/children/${activeChildId}/${s}`),
  );

  const rowCls = (active: boolean) =>
    [
      'relative flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors',
      collapsed ? 'justify-center' : '',
      active ? 'bg-white font-semibold text-brand-700 shadow' : 'text-white/75 hover:bg-white/10',
    ].join(' ');

  const subLinkCls = (active: boolean) =>
    [
      'flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] transition-colors',
      active ? 'bg-white/20 font-medium text-white' : 'text-white/70 hover:bg-white/10',
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
      <nav className="sidebar-scroll -me-1 flex-1 overflow-y-auto overflow-x-hidden pe-1 py-1">
        <ul className="space-y-1">
          <li>
            <Link
              href={prefix}
              title={collapsed ? t('home') : undefined}
              className={rowCls(pathname === prefix || pathname === `${prefix}/`)}
            >
              <span className="w-5 shrink-0 text-center text-base leading-none">🏠</span>
              {!collapsed && <span className="flex-1 truncate">{t('home')}</span>}
            </Link>
          </li>

          {!collapsed && (
            <li className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-white/50">
              {t('children')}
            </li>
          )}
          {children.map((c) => {
            const base = `${prefix}/children/${c.id}`;
            const isActiveChild = activeChildId === c.id;
            const total = (c.unread ?? 0) + (c.pendingFees ?? 0);
            const initials = `${c.firstName[0] ?? ''}${c.lastName[0] ?? ''}`.toUpperCase();
            return (
              <li key={c.id}>
                <Link
                  href={`${base}/cahier`}
                  title={collapsed ? `${c.firstName} ${c.lastName}` : undefined}
                  className={rowCls(isActiveChild)}
                >
                  <span
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold ${
                      isActiveChild ? 'bg-brand-100 text-brand-700' : 'bg-white/20 text-white'
                    }`}
                  >
                    {initials}
                  </span>
                  {!collapsed && (
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-center gap-1.5 truncate">
                        {c.firstName} {c.lastName}
                        {total > 0 && (
                          <span className="inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
                            {total}
                          </span>
                        )}
                      </span>
                      {c.className && (
                        <span className="truncate text-[11px] font-normal opacity-70">
                          {c.className}
                        </span>
                      )}
                    </span>
                  )}
                  {collapsed && total > 0 && (
                    <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-600" />
                  )}
                </Link>
                {isActiveChild && !collapsed && (
                  <ul className="my-1 ms-3 space-y-0.5 border-s border-white/20 ps-2">
                    {CHILD_SECTIONS.map((s) => (
                      <li key={s}>
                        <Link href={`${base}/${s}`} className={subLinkCls(activeSection === s)}>
                          <span className="w-4 shrink-0 text-center text-[13px] leading-none">
                            {SECTION_EMOJI[s]}
                          </span>
                          <span className="flex-1 truncate">{t(`sections.${s}`)}</span>
                          {s === 'vie-scolaire' && (c.unread ?? 0) > 0 && (
                            <span className="inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
                              {c.unread}
                            </span>
                          )}
                          {s === 'scolarite' && (c.pendingFees ?? 0) > 0 && (
                            <span className="inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
                              {c.pendingFees}
                            </span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}

          {!collapsed && (
            <li className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wide text-white/50">
              {t('general')}
            </li>
          )}
          {/* « Messages » retiré du menu : accessible via l'enveloppe de l'en-tête.
              « Bourse aux livres » : entrée unique agrégeant tous les enfants. */}
          {(['announcements', 'bourse', 'surveys', 'account'] as const).map((k) => (
            <li key={k}>
              <Link
                href={`${prefix}/${k}`}
                title={collapsed ? t(k) : undefined}
                className={rowCls(pathname.startsWith(`${prefix}/${k}`))}
              >
                <span className="w-5 shrink-0 text-center text-base leading-none">
                  {GENERAL_EMOJI[k]}
                </span>
                {!collapsed && <span className="flex-1 truncate">{t(k)}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
