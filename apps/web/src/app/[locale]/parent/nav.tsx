'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

type Child = { id: string; firstName: string; lastName: string; className: string | null };

export function ParentSidebar({
  locale,
  tenantName,
  children,
}: {
  locale: string;
  tenantName: string;
  children: Child[];
}) {
  const pathname = usePathname();
  const t = useTranslations('parent.nav');
  const prefix = `/${locale}/parent`;

  const linkCls = (active: boolean) =>
    [
      'block rounded-lg px-3 py-2 text-sm transition-colors',
      active ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-700 hover:bg-slate-100',
    ].join(' ');

  return (
    <aside className="w-60 shrink-0 border-e border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            J
          </span>
          <div>
            <div className="text-sm font-semibold text-slate-900">Jawal</div>
            <div className="truncate text-xs text-slate-500">{tenantName}</div>
          </div>
        </div>
      </div>
      <nav className="px-2 py-3">
        <ul className="space-y-0.5">
          <li>
            <Link href={prefix} className={linkCls(pathname === prefix || pathname === `${prefix}/`)}>
              {t('home')}
            </Link>
          </li>

          <li className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {t('children')}
          </li>
          {children.map((c) => {
            const href = `${prefix}/children/${c.id}`;
            return (
              <li key={c.id}>
                <Link href={href} className={linkCls(pathname.startsWith(href))}>
                  <span className="block truncate">
                    {c.firstName} {c.lastName}
                  </span>
                  {c.className && (
                    <span className="block truncate text-[11px] text-slate-400">{c.className}</span>
                  )}
                </Link>
              </li>
            );
          })}

          <li className="pt-3">
            <Link
              href={`${prefix}/announcements`}
              className={linkCls(pathname.startsWith(`${prefix}/announcements`))}
            >
              {t('announcements')}
            </Link>
          </li>
          <li>
            <Link
              href={`${prefix}/messages`}
              className={linkCls(pathname.startsWith(`${prefix}/messages`))}
            >
              {t('messages')}
            </Link>
          </li>
          <li>
            <Link
              href={`${prefix}/account`}
              className={linkCls(pathname.startsWith(`${prefix}/account`))}
            >
              {t('account')}
            </Link>
          </li>
        </ul>
      </nav>
    </aside>
  );
}
