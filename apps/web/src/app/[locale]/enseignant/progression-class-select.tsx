'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';

/** Sélecteur de classe (auto-navigation) pour le tableau de progression, en préservant la période. */
export function ProgressionClassSelect({
  classes,
  selectedClassId,
}: {
  classes: { id: string; name: string }[];
  selectedClassId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(sp.toString());
    params.set('class', e.target.value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <select
      value={selectedClassId ?? ''}
      onChange={onChange}
      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm"
    >
      {classes.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
