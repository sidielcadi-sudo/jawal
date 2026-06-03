'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

type NavItem = {
  href: string;
  labelKey: keyof IntlMessages['admin']['nav'];
  match: (pathname: string, search: URLSearchParams) => boolean;
};

// type helper local — pas un vrai schéma de messages, juste pour l'autocomplete
type IntlMessages = {
  admin: { nav: { dashboard: string; pilotage: string; vieScolaire: string; students: string; teachers: string; staff: string; parents: string; classes: string; enrollments: string; timetable: string; attendance: string; justifications: string; staffAttendance: string; announcements: string; messages: string; finance: string; import: string; settings: string } };
};

function buildItems(locale: string): NavItem[] {
  const prefix = `/${locale}/admin`;
  return [
    {
      href: `${prefix}`,
      labelKey: 'dashboard',
      match: (p, _s) => p === prefix || p === `${prefix}/`,
    },
    {
      href: `${prefix}/pilotage`,
      labelKey: 'pilotage',
      match: (p, _s) => p.startsWith(`${prefix}/pilotage`),
    },
    {
      href: `${prefix}/vie-scolaire`,
      labelKey: 'vieScolaire',
      match: (p, _s) => p.startsWith(`${prefix}/vie-scolaire`),
    },
    {
      href: `${prefix}/persons?type=STUDENT`,
      labelKey: 'students',
      match: (p, s) => p.startsWith(`${prefix}/persons`) && !p.includes('/import') && s.get('type') === 'STUDENT',
    },
    {
      href: `${prefix}/persons?type=TEACHER`,
      labelKey: 'teachers',
      match: (p, s) => p.startsWith(`${prefix}/persons`) && !p.includes('/import') && s.get('type') === 'TEACHER',
    },
    {
      href: `${prefix}/persons?type=STAFF`,
      labelKey: 'staff',
      match: (p, s) => p.startsWith(`${prefix}/persons`) && !p.includes('/import') && s.get('type') === 'STAFF',
    },
    {
      href: `${prefix}/persons?type=PARENT`,
      labelKey: 'parents',
      match: (p, s) => p.startsWith(`${prefix}/persons`) && !p.includes('/import') && s.get('type') === 'PARENT',
    },
    {
      href: `${prefix}/classes`,
      labelKey: 'classes',
      match: (p, _s) => p.startsWith(`${prefix}/classes`),
    },
    {
      href: `${prefix}/enrollments`,
      labelKey: 'enrollments',
      match: (p, _s) => p.startsWith(`${prefix}/enrollments`),
    },
    {
      href: `${prefix}/timetable`,
      labelKey: 'timetable',
      match: (p, _s) =>
        p === `${prefix}/timetable` || p.startsWith(`${prefix}/timetable`),
    },
    {
      href: `${prefix}/attendance`,
      labelKey: 'attendance',
      match: (p, _s) =>
        p === `${prefix}/attendance` ||
        (p.startsWith(`${prefix}/attendance`) && !p.includes('/justifications')),
    },
    {
      href: `${prefix}/attendance/justifications`,
      labelKey: 'justifications',
      match: (p, _s) => p.startsWith(`${prefix}/attendance/justifications`),
    },
    {
      href: `${prefix}/staff-attendance`,
      labelKey: 'staffAttendance',
      match: (p, _s) => p.startsWith(`${prefix}/staff-attendance`),
    },
    {
      href: `${prefix}/announcements`,
      labelKey: 'announcements',
      match: (p, _s) => p.startsWith(`${prefix}/announcements`),
    },
    {
      href: `${prefix}/messages`,
      labelKey: 'messages',
      match: (p, _s) => p.startsWith(`${prefix}/messages`),
    },
    {
      href: `${prefix}/finance`,
      labelKey: 'finance',
      match: (p, _s) => p === `${prefix}/finance` || p.startsWith(`${prefix}/finance/`),
    },
    {
      href: `${prefix}/persons/import`,
      labelKey: 'import',
      match: (p, _s) => p.includes('/persons/import'),
    },
    {
      href: `${prefix}/settings`,
      labelKey: 'settings',
      match: (p, _s) => p.startsWith(`${prefix}/settings`),
    },
  ];
}

export function AdminSidebar({ locale, tenantName }: { locale: string; tenantName: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations('admin.nav');
  const items = buildItems(locale);

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
          {items.map((item) => {
            const active = item.match(pathname, searchParams);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={[
                    'block rounded-lg px-3 py-2 text-sm transition-colors',
                    active
                      ? 'bg-brand-50 font-medium text-brand-700'
                      : 'text-slate-700 hover:bg-slate-100',
                  ].join(' ')}
                >
                  {t(item.labelKey)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
