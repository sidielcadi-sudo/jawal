'use client';

import { useRouter } from 'next/navigation';

/** Filtre « Depuis le » : un sélecteur de date qui recharge la page avec ?since=. */
export function SinceFilter({
  label,
  value,
  basePath,
  tab,
}: {
  label: string;
  value: string;
  basePath: string;
  tab?: string;
}) {
  const router = useRouter();
  return (
    <label className="mb-4 flex items-center gap-2 text-sm text-slate-600">
      <span>{label}</span>
      <input
        type="date"
        defaultValue={value}
        onChange={(e) => {
          const params = new URLSearchParams();
          if (tab) params.set('tab', tab);
          if (e.target.value) params.set('since', e.target.value);
          router.push(`${basePath}?${params.toString()}`);
        }}
        className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm shadow-sm"
      />
    </label>
  );
}
