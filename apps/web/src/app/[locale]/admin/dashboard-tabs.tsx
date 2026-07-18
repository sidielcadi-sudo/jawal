'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

/**
 * Onglets du menu « Tableau de bord ».
 * - Admin / direction : 3 onglets (Pilotage + Cockpit vie scolaire + Journalier),
 *   l'onglet Pilotage pointant sur la page racine /admin (KPI direction).
 * - Vie scolaire (CPE) : 2 onglets seulement (Cockpit + Journalier), sans
 *   Pilotage — piloté par `showPilotage`.
 */
const PILOTAGE_TAB = { key: 'pilotage', seg: '' } as const;
const BASE_TABS = [
  { key: 'cockpit', seg: '/vie-scolaire' },
  { key: 'journee', seg: '/vie-scolaire/journee' },
] as const;

export function DashboardTabs({
  locale,
  showPilotage = false,
}: {
  locale: string;
  showPilotage?: boolean;
}) {
  const pathname = usePathname();
  const t = useTranslations('admin.dashboardTabs');
  const base = `/${locale}/admin`;
  const tabs = showPilotage ? [PILOTAGE_TAB, ...BASE_TABS] : BASE_TABS;

  return (
    <nav className="folder-tabs">
      {tabs.map((tab) => {
        const href = `${base}${tab.seg}`;
        // Pilotage (segment vide) et Cockpit (/vie-scolaire) matchent en exact ;
        // le journalier match par préfixe (sous-pages appel…).
        const active =
          tab.seg === ''
            ? pathname === base || pathname === `${base}/`
            : tab.seg === '/vie-scolaire'
              ? pathname === href
              : pathname.startsWith(href);
        return (
          <Link key={tab.key} href={href} className={`folder-tab ${active ? 'is-active' : ''}`}>
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}
