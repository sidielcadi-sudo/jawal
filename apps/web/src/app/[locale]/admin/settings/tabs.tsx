'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

// Le groupe emploi du temps (Créneaux, Réglages EDT, Contraintes EDT) est placé
// en fin de liste, juste avant l'entrée « Emploi du temps » (ajoutée plus bas).
const TABS = ['establishment', 'appearance', 'years', 'curriculum', 'subjects', 'rooms', 'fees', 'admissions', 'attendance-reasons', 'roles', 'users', 'audit', 'timetable-slots', 'timetable-settings', 'timetable-constraints'] as const;
type Tab = (typeof TABS)[number];

export function SettingsTabs({ locale }: { locale: string }) {
  const pathname = usePathname();
  const t = useTranslations('admin.settings.tabs');
  const base = `/${locale}/admin/settings`;

  // « Emploi du temps » déplacé du menu latéral vers Paramétrage : entrée
  // pointant vers la page EDT (/admin/timetable), hors du préfixe /settings.
  const entries: { key: string; href: string; label: string; active: boolean }[] = TABS.map(
    (tab) => ({
      key: tab,
      href: `${base}/${tab}`,
      label: t(tab satisfies Tab),
      active: pathname.startsWith(`${base}/${tab}`),
    }),
  );
  entries.push({
    key: 'timetable',
    href: `/${locale}/admin/timetable`,
    label: t('timetable'),
    active: pathname.startsWith(`/${locale}/admin/timetable`),
  });

  return (
    <nav className="folder-tabs">
      {entries.map((e) => (
        <Link key={e.key} href={e.href} className={`folder-tab ${e.active ? 'is-active' : ''}`}>
          {e.label}
        </Link>
      ))}
    </nav>
  );
}
