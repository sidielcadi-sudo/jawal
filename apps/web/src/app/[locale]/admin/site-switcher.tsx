'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { switchSiteAction } from './switch-site-action';

/** Sélecteur d'établissement (comptes multi-sites). Masqué si un seul site. */
export function SiteSwitcher({
  sites,
  activeTenantId,
}: {
  sites: { tenantId: string; name: string }[];
  activeTenantId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (sites.length <= 1) return null;

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const tenantId = e.target.value;
    start(async () => {
      await switchSiteAction(tenantId);
      router.refresh();
    });
  }

  return (
    <label
      className={`flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 ps-3 pe-2 py-1.5 transition-opacity ${
        pending ? 'opacity-60' : ''
      }`}
      title="Changer d'établissement"
    >
      <span className="text-sm leading-none">🏫</span>
      <select
        value={activeTenantId}
        onChange={onChange}
        disabled={pending}
        className="cursor-pointer border-0 bg-transparent pe-1 text-[13px] font-semibold text-brand-800 focus:outline-none focus:ring-0"
      >
        {sites.map((s) => (
          <option key={s.tenantId} value={s.tenantId}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}
