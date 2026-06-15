'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

export function StudentSidebar({
  locale,
  tenantName,
  studentName,
  className,
}: {
  locale: string;
  tenantName: string;
  studentName: string;
  className: string | null;
}) {
  const pathname = usePathname();
  const t = useTranslations('eleve.nav');
  const prefix = `/${locale}/eleve`;

  const items = [
    { key: 'home', href: prefix, exact: true },
    { key: 'notes', href: `${prefix}/notes` },
    { key: 'bulletins', href: `${prefix}/bulletins` },
    { key: 'carnet', href: `${prefix}/carnet` },
  ];

  const linkCls = (active: boolean) =>
    [
      'flex items-center rounded-lg border-s-[3px] px-3 py-2 text-sm transition-colors',
      active
        ? 'border-brand-600 bg-brand-50 font-semibold text-brand-600'
        : 'border-transparent text-slate-700 hover:bg-slate-100',
    ].join(' ');

  return (
    <aside className="w-60 shrink-0 border-e border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/sesame-logo.png" alt="Sesame" className="h-7 w-auto" />
        <div className="mt-1.5 truncate text-xs text-slate-500">{tenantName}</div>
      </div>
      <div className="border-b border-slate-100 px-5 py-3">
        <div className="truncate text-sm font-semibold text-slate-800">{studentName}</div>
        {className && <div className="truncate text-xs text-slate-400">{className}</div>}
      </div>
      <nav className="px-2 py-3">
        <ul className="space-y-0.5">
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
