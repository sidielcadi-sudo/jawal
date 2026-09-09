'use client';

import { useRouter } from 'next/navigation';

/**
 * Choix de l'année pour la grille tarifaire annuelle.
 *
 * La navigation passe par l'URL — et non par un état local — pour que le
 * filtre survive à un rechargement et reste partageable : « regarde la grille
 * du collège 2025-2026 » doit tenir dans un lien.
 */
export function FeeYearSelect({
  years,
  selected,
  cycleId,
  base,
  allLabel,
}: {
  years: { id: string; label: string; active: boolean }[];
  selected: string;
  cycleId: string;
  base: string;
  allLabel: string;
}) {
  const router = useRouter();

  return (
    <select
      value={selected}
      onChange={(e) => {
        const qs = new URLSearchParams({ subtab: 'annual' });
        if (cycleId) qs.set('cycle', cycleId);
        if (e.target.value) qs.set('year', e.target.value);
        router.push(`${base}?${qs.toString()}`);
      }}
      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800"
    >
      <option value="">{allLabel}</option>
      {years.map((y) => (
        <option key={y.id} value={y.id}>
          {y.label}
          {y.active ? ' ★' : ''}
        </option>
      ))}
    </select>
  );
}
