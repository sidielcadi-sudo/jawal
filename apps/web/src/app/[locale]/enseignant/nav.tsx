'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

export function TeacherSidebar({
  locale,
  tenantName,
  teacherName,
}: {
  locale: string;
  tenantName: string;
  teacherName: string;
}) {
  const pathname = usePathname();
  const t = useTranslations('enseignant.nav');
  const prefix = `/${locale}/enseignant`;

  const items = [
    { href: prefix, key: 'home', exact: true },
    { href: `${prefix}/timetable`, key: 'timetable', exact: false },
    { href: `${prefix}/classes`, key: 'classes', exact: false },
    { href: `${prefix}/messages`, key: 'messages', exact: false },
    { href: `${prefix}/account`, key: 'account', exact: false },
  ] as const;

  const cls = (active: boolean) =>
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
        <div className="mt-2 truncate text-xs text-slate-400">{teacherName}</div>
      </div>
      <nav className="px-2 py-3">
        <ul className="space-y-0.5">
          {items.map((it) => {
            const active = it.exact ? pathname === it.href || pathname === `${it.href}/` : pathname.startsWith(it.href);
            return (
              <li key={it.key}>
                <Link href={it.href} className={cls(active)}>
                  {t(it.key)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
