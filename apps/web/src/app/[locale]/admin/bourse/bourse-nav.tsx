'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

/**
 * Navigation de la bourse aux livres, partagée par les cinq écrans.
 *
 * L'écran courant est mis en plein bleu — sans repère, on ne savait pas où
 * l'on se trouvait une fois sorti de la page d'accueil.
 */
export function BourseNav({ locale }: { locale: string }) {
  const t = useTranslations('admin.bourse');
  const pathname = usePathname();
  const base = `/${locale}/admin/bourse`;

  const items = [
    { seg: '/depot', label: t('depot.cta') },
    { seg: '/vente', label: t('vente.cta') },
    { seg: '/remboursements', label: t('refund.cta') },
    { seg: '/finance', label: t('finance.cta') },
  ];

  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      {items.map((it) => {
        const href = `${base}${it.seg}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={it.seg}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={
              active
                ? 'rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm'
                : 'rounded-xl border border-brand-300 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50'
            }
          >
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}
