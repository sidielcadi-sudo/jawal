'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

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
      soutien: string;
      competences: string;
      comptabilite: string;
      import: string;
      settings: string;
    };
  };
};

function buildItems(locale: string, roleCodes: string[]): NavItem[] {
  const prefix = `/${locale}/admin`;
  // Utilisateurs vie scolaire (CPE hors direction) : leur « Tableau de bord »
  // est le Cockpit vie scolaire (pas la page Pilotage, réservée à la direction).
  const isVieScolaireOnly =
    roleCodes.includes('cpe') &&
    !roleCodes.includes('tenant_admin') &&
    !roleCodes.includes('direction');
  // Ordre du menu défini par la refonte (liste explicite). « Emploi du temps »
  // est déplacé dans Paramétrage ; l'ancien « Justifications »
  // (attendance/justifications) est retiré du menu (page joignable par URL).
  // « Vie scolaire » n'a plus d'entrée : le cockpit et le tableau de bord
  // journalier sont des onglets de « Tableau de bord » (cf. DashboardTabs).
  return [
    {
      href: isVieScolaireOnly ? `${prefix}/vie-scolaire` : `${prefix}`,
      labelKey: 'dashboard',
      match: (p, _s) =>
        p === prefix || p === `${prefix}/` || p.startsWith(`${prefix}/vie-scolaire`),
    },
    {
      href: `${prefix}/enrollments`,
      labelKey: 'enrollments',
      match: (p, _s) => p.startsWith(`${prefix}/enrollments`),
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
      href: `${prefix}/finance`,
      labelKey: 'finance',
      match: (p, _s) => p === `${prefix}/finance` || p.startsWith(`${prefix}/finance/`),
      roles: ['tenant_admin', 'direction', 'comptable'],
    },
    {
      href: `${prefix}/carnet`,
      labelKey: 'carnet',
      match: (p, _s) => p.startsWith(`${prefix}/carnet`),
      roles: ['cpe', 'tenant_admin', 'direction', 'scolarite'],
    },
    // « Justifications » = ancienne « Gestion des absences » (attendance/management),
    // renommée. Placée juste après le carnet de correspondance.
    {
      href: `${prefix}/attendance/management`,
      labelKey: 'justifications',
      match: (p, _s) => p.startsWith(`${prefix}/attendance/management`),
      roles: ['cpe', 'tenant_admin', 'direction'],
    },
    {
      href: `${prefix}/competences/bilan`,
      labelKey: 'competences',
      match: (p, _s) => p.startsWith(`${prefix}/competences`),
      roles: ['cpe', 'tenant_admin', 'direction', 'scolarite'],
    },
    {
      href: `${prefix}/soutien`,
      labelKey: 'soutien',
      match: (p, _s) => p.startsWith(`${prefix}/soutien`),
      roles: ['cpe', 'tenant_admin', 'direction', 'scolarite'],
    },
    {
      href: `${prefix}/leave`,
      labelKey: 'leave',
      match: (p, _s) => p.startsWith(`${prefix}/leave`),
      // Vie scolaire incluse : elle enregistre les absences et organise les
      // remplacements (l'approbation reste réservée à l'admin/direction).
      roles: ['tenant_admin', 'direction', 'cpe', 'scolarite'],
    },
    {
      href: `${prefix}/staff-attendance`,
      labelKey: 'staffAttendance',
      match: (p, _s) => p.startsWith(`${prefix}/staff-attendance`),
      roles: ['tenant_admin', 'direction'],
    },
    {
      href: `${prefix}/overtime`,
      labelKey: 'overtime',
      match: (p, _s) => p.startsWith(`${prefix}/overtime`),
      roles: ['tenant_admin', 'direction', 'comptable'],
    },
    {
      href: `${prefix}/transport`,
      labelKey: 'transport',
      match: (p, _s) => p.startsWith(`${prefix}/transport`),
      roles: ['tenant_admin', 'direction', 'cpe'],
    },
    {
      href: `${prefix}/payroll`,
      labelKey: 'payroll',
      match: (p, _s) => p.startsWith(`${prefix}/payroll`),
      roles: ['tenant_admin', 'direction', 'comptable'],
    },
    {
      href: `${prefix}/comptabilite`,
      labelKey: 'comptabilite',
      match: (p, _s) => p.startsWith(`${prefix}/comptabilite`),
      roles: ['tenant_admin', 'direction', 'comptable'],
    },
    // « Importer CSV » (persons/import) est retiré du menu : la page reste
    // joignable par URL, mais l'import de référence est désormais
    // « Import MASSAR », depuis la page Inscriptions.
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
      href: `${prefix}/bourse`,
      labelKey: 'bourse',
      match: (p, _s) => p.startsWith(`${prefix}/bourse`),
      roles: ['tenant_admin', 'direction', 'cpe'],
    },
    {
      href: `${prefix}/settings`,
      labelKey: 'settings',
      match: (p, _s) => p.startsWith(`${prefix}/settings`),
      roles: ['tenant_admin', 'direction'],
    },
  ];
}

// Emoji par entrée de menu (affiché à gauche du libellé, nativement en couleur).
const EMOJI: Record<string, string> = {
  dashboard: '📊',
  enrollments: '📝',
  students: '🎓',
  teachers: '👩‍🏫',
  staff: '🧑‍💼',
  parents: '👪',
  classes: '🏫',
  finance: '💰',
  soutien: '📚',
  competences: '🎯',
  carnet: '📒',
  justifications: '✅',
  transport: '🚍',
  staffAttendance: '🕒',
  leave: '🌴',
  overtime: '⏱️',
  payroll: '💵',
  comptabilite: '🧮',
  import: '📥',
  announcements: '📢',
  surveys: '🗳️',
  bourse: '📖',
  settings: '⚙️',
};

export function AdminSidebar({
  locale,
  roleCodes,
  vieScolaireBadge = 0,
  multiSite = false,
}: {
  locale: string;
  roleCodes: string[];
  vieScolaireBadge?: number;
  multiSite?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations('admin.nav');
  // État réduit/déployé, mémorisé dans le navigateur (persiste entre les pages).
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
        /* stockage indisponible : on garde l'état en mémoire seulement */
      }
      return next;
    });
  }
  const items = buildItems(locale, roleCodes).filter(
    (item) => !item.roles || item.roles.some((r) => roleCodes.includes(r)),
  );

  const linkCls = (active: boolean) =>
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
      {/* En-tête : bouton réduire / agrandir. Le logo de l'établissement est
          désormais affiché à l'extrême gauche de la bande d'en-tête. */}
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
      <nav className="sidebar-scroll -me-1 flex-1 overflow-y-auto overflow-x-hidden pe-1">
        <ul className="space-y-1">
          {multiSite && (
            <li>
              <Link
                href={`/${locale}/admin/group`}
                title={collapsed ? t('group') : undefined}
                className={linkCls(pathname.startsWith(`/${locale}/admin/group`))}
              >
                <span className="w-5 shrink-0 text-center text-base leading-none">🏢</span>
                {!collapsed && <span className="flex-1 truncate">{t('group')}</span>}
              </Link>
            </li>
          )}
          {items.map((item) => {
            const active = item.match(pathname, searchParams);
            const badge = item.labelKey === 'vieScolaire' ? vieScolaireBadge : 0;
            const emoji = EMOJI[item.labelKey];
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={collapsed ? t(item.labelKey) : undefined}
                  className={linkCls(active)}
                >
                  {emoji && (
                    <span className="w-5 shrink-0 text-center text-base leading-none">{emoji}</span>
                  )}
                  {!collapsed && <span className="flex-1 truncate">{t(item.labelKey)}</span>}
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
