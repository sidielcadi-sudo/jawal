'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

type Child = {
  id: string;
  firstName: string;
  lastName: string;
  className: string | null;
  unread?: number;
  pendingFees?: number;
};

const CHILD_SECTIONS = ['cahier', 'notes', 'vie-scolaire', 'scolarite', 'bourse', 'documents'] as const;

export function ParentSidebar({
  locale,
  tenantName,
  children,
  logoUrl,
}: {
  locale: string;
  tenantName: string;
  children: Child[];
  logoUrl?: string | null;
}) {
  const pathname = usePathname();
  const t = useTranslations('parent.nav');
  const prefix = `/${locale}/parent`;

  // Enfant actif déduit de l'URL : /parent/children/{id}/...
  const m = pathname.match(/\/parent\/children\/([^/]+)/);
  const activeChildId = m?.[1] ?? null;
  const activeSection = CHILD_SECTIONS.find((s) =>
    pathname.includes(`/children/${activeChildId}/${s}`),
  );

  const linkCls = (active: boolean) =>
    [
      'flex flex-col rounded-xl px-3 py-2.5 text-sm transition-colors',
      active
        ? 'bg-white font-semibold text-[#143fa6] shadow'
        : 'text-white/75 hover:bg-white/10',
    ].join(' ');

  const subLinkCls = (active: boolean) =>
    [
      'block rounded-lg px-3 py-1.5 text-[13px] transition-colors',
      active ? 'bg-white/20 font-medium text-white' : 'text-white/70 hover:bg-white/10',
    ].join(' ');

  return (
    <aside className="m-3 flex h-[calc(100vh-1.5rem)] w-60 shrink-0 flex-col rounded-3xl bg-gradient-to-b from-[#1A56DB] to-[#123a8f] p-4 text-white">
      <div className="flex justify-center px-1.5 pb-4 pt-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl ?? '/sesame-logo.png'} alt={tenantName || 'Logo'} className="h-14 w-auto object-contain" />
      </div>
      <nav className="sidebar-scroll -me-1 flex-1 overflow-y-auto pe-1 py-1">
        <ul className="space-y-1">
          <li>
            <Link
              href={prefix}
              className={linkCls(pathname === prefix || pathname === `${prefix}/`)}
            >
              {t('home')}
            </Link>
          </li>

          <li className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-white/50">
            {t('children')}
          </li>
          {children.map((c) => {
            const base = `${prefix}/children/${c.id}`;
            const isActiveChild = activeChildId === c.id;
            return (
              <li key={c.id}>
                <Link href={`${base}/cahier`} className={linkCls(isActiveChild)}>
                  <span className="flex items-center gap-1.5 truncate">
                    {c.firstName} {c.lastName}
                    {(c.unread ?? 0) + (c.pendingFees ?? 0) > 0 && (
                      <span className="inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
                        {(c.unread ?? 0) + (c.pendingFees ?? 0)}
                      </span>
                    )}
                  </span>
                  {c.className && (
                    <span className="truncate text-[11px] font-normal opacity-70">
                      {c.className}
                    </span>
                  )}
                </Link>
                {isActiveChild && (
                  <ul className="my-1 ms-3 space-y-0.5 border-s border-white/20 ps-2">
                    {CHILD_SECTIONS.map((s) => (
                      <li key={s}>
                        <Link
                          href={`${base}/${s}`}
                          className={subLinkCls(activeSection === s)}
                        >
                          <span className="flex items-center justify-between gap-1.5">
                            {t(`sections.${s}`)}
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
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}

          <li className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wide text-white/50">
            {t('general')}
          </li>
          {(['announcements', 'messages', 'surveys', 'account'] as const).map((k) => (
            <li key={k}>
              <Link
                href={`${prefix}/${k}`}
                className={linkCls(pathname.startsWith(`${prefix}/${k}`))}
              >
                {t(k)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
