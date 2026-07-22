import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

/** Onglets partagés entre la gestion des cours et le rapport de soutien. */
export async function SoutienTabs({ locale, active }: { locale: string; active: 'manage' | 'report' }) {
  const t = await getTranslations('admin.soutien');
  return (
    <nav className="folder-tabs mb-4">
      <Link href={`/${locale}/admin/soutien`} className={`folder-tab ${active === 'manage' ? 'is-active' : ''}`}>
        {t('tabs.manage')}
      </Link>
      <Link href={`/${locale}/admin/soutien/rapport`} className={`folder-tab ${active === 'report' ? 'is-active' : ''}`}>
        {t('tabs.report')}
      </Link>
    </nav>
  );
}
