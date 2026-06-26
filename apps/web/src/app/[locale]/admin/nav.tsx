'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

type NavItem = {
  href: string;
  labelKey: keyof IntlMessages['admin']['nav'];
  match: (pathname: string, search: URLSearchParams) => boolean;
  /** Rôles autorisés à voir l'entrée. Absent = visible par tous les rôles admin. */
  roles?: string[];
};

// type helper local — pas un vrai schéma de messages, juste pour l'autocomplete
type IntlMessages = {
  admin: {
    nav: {
      dashboard: string;
      pilotage: string;
      vieScolaire: string;
      carnet: string;
      absenceMgmt: string;
      students: string;
      teachers: string;
      staff: string;
      parents: string;
      classes: string;
      enrollments: string;
      transport: string;
      timetable: string;
      attendance: string;
      justifications: string;
      staffAttendance: string;
      leave: string;
      overtime: string;
      payroll: string;
      bourse: string;
      announcements: string;
      surveys: string;
      messages: string;
      finance: string;
      import: string;
      settings: string;
    };
  };
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
      href: `${prefix}/vie-scolaire`,
      labelKey: 'vieScolaire',
      match: (p, _s) => p.startsWith(`${prefix}/vie-scolaire`),
      // Point 6 : visible uniquement pour la Vie scolaire (CPE), pas pour
      // la direction / l'admin établissement.
      roles: ['cpe'],
    },
    {
      href: `${prefix}/carnet`,
      labelKey: 'carnet',
      match: (p, _s) => p.startsWith(`${prefix}/carnet`),
      roles: ['cpe', 'tenant_admin', 'direction', 'scolarite'],
    },
    {
      href: `${prefix}/attendance/management`,
      labelKey: 'absenceMgmt',
      match: (p, _s) => p.startsWith(`${prefix}/attendance/management`),
      roles: ['cpe', 'tenant_admin', 'direction'],
    },
    {
      href: `${prefix}/persons?type=STUDENT`,
      labelKey: 'students',
      match: (p, s) =>
        p.startsWith(`${prefix}/persons`) && !p.includes('/import') && s.get('type') === 'STUDENT',
    },
    {
      href: `${prefix}/persons?type=TEACHER`,
      labelKey: 'teachers',
      match: (p, s) =>
        p.startsWith(`${prefix}/persons`) && !p.includes('/import') && s.get('type') === 'TEACHER',
    },
    {
      href: `${prefix}/persons?type=STAFF`,
      labelKey: 'staff',
      match: (p, s) =>
        p.startsWith(`${prefix}/persons`) && !p.includes('/import') && s.get('type') === 'STAFF',
    },
    {
      href: `${prefix}/persons?type=PARENT`,
      labelKey: 'parents',
      match: (p, s) =>
        p.startsWith(`${prefix}/persons`) && !p.includes('/import') && s.get('type') === 'PARENT',
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
      href: `${prefix}/bourse`,
      labelKey: 'bourse',
      match: (p, _s) => p.startsWith(`${prefix}/bourse`),
      roles: ['tenant_admin', 'direction', 'cpe'],
    },
    {
      href: `${prefix}/transport`,
      labelKey: 'transport',
      match: (p, _s) => p.startsWith(`${prefix}/transport`),
      roles: ['tenant_admin', 'direction', 'cpe'],
    },
    {
      href: `${prefix}/timetable`,
      labelKey: 'timetable',
      match: (p, _s) => p === `${prefix}/timetable` || p.startsWith(`${prefix}/timetable`),
    },
    // Lien « Présences » masqué (la page reste accessible par URL directe).
    {
      href: `${prefix}/attendance/justifications`,
      labelKey: 'justifications',
      match: (p, _s) => p.startsWith(`${prefix}/attendance/justifications`),
    },
    {
      href: `${prefix}/staff-attendance`,
      labelKey: 'staffAttendance',
      match: (p, _s) => p.startsWith(`${prefix}/staff-attendance`),
      roles: ['tenant_admin', 'direction'],
    },
    {
      href: `${prefix}/leave`,
      labelKey: 'leave',
      match: (p, _s) => p.startsWith(`${prefix}/leave`),
      roles: ['tenant_admin', 'direction'],
    },
    {
      href: `${prefix}/overtime`,
      labelKey: 'overtime',
      match: (p, _s) => p.startsWith(`${prefix}/overtime`),
      roles: ['tenant_admin', 'direction', 'comptable'],
    },
    {
      href: `${prefix}/payroll`,
      labelKey: 'payroll',
      match: (p, _s) => p.startsWith(`${prefix}/payroll`),
      roles: ['tenant_admin', 'direction', 'comptable'],
    },
    {
      href: `${prefix}/announcements`,
      labelKey: 'announcements',
      match: (p, _s) => p.startsWith(`${prefix}/announcements`),
    },
    {
      href: `${prefix}/surveys`,
      labelKey: 'surveys',
      match: (p, _s) => p.startsWith(`${prefix}/surveys`),
      roles: ['tenant_admin', 'direction'],
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
      roles: ['tenant_admin', 'direction', 'comptable'],
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
      roles: ['tenant_admin', 'direction'],
    },
  ];
}

export function AdminSidebar({
  locale,
  tenantName,
  roleCodes,
  logoUrl,
  vieScolaireBadge = 0,
  multiSite = false,
}: {
  locale: string;
  tenantName: string;
  roleCodes: string[];
  logoUrl?: string | null;
  vieScolaireBadge?: number;
  multiSite?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations('admin.nav');
  const items = buildItems(locale).filter(
    (item) => !item.roles || item.roles.some((r) => roleCodes.includes(r)),
  );

  return (
    <aside className="m-3 flex h-[calc(100vh-1.5rem)] w-60 shrink-0 flex-col rounded-3xl bg-gradient-to-b from-[#1A56DB] to-[#123a8f] p-4 text-white">
      <div className="flex justify-center px-1.5 pb-4 pt-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl ?? '/sesame-logo.png'} alt={tenantName || 'Logo'} className="h-14 w-auto object-contain" />
      </div>
      <nav className="sidebar-scroll -me-1 flex-1 overflow-y-auto pe-1">
        <ul className="space-y-1">
          {multiSite && (
            <li>
              <Link
                href={`/${locale}/admin/group`}
                className={[
                  'flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm transition-colors',
                  pathname.startsWith(`/${locale}/admin/group`)
                    ? 'bg-white font-semibold text-[#143fa6] shadow'
                    : 'text-white/75 hover:bg-white/10',
                ].join(' ')}
              >
                🏫 {t('group')}
              </Link>
            </li>
          )}
          {items.map((item) => {
            const active = item.match(pathname, searchParams);
            const badge = item.labelKey === 'vieScolaire' ? vieScolaireBadge : 0;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={[
                    'flex items-center justify-between gap-1.5 rounded-xl px-3 py-2 text-sm transition-colors',
                    active
                      ? 'bg-white font-semibold text-[#143fa6] shadow'
                      : 'text-white/75 hover:bg-white/10',
                  ].join(' ')}
                >
                  {t(item.labelKey)}
                  {badge > 0 && (
                    <span className="inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
                      {badge}
                    </span>
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
