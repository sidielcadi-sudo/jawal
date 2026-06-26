'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

type YearOpt = { id: string; label: string; active: boolean };

export function YearSelect({ years, selectedYearId }: { years: YearOpt[]; selectedYearId: string | null }) {
  const t = useTranslations('admin.finance');
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(sp.toString());
    params.set('year', e.target.value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <label className="flex items-center gap-2">
      <span className="text-xs font-medium text-slate-600">{t('year')}</span>
      <select
        value={selectedYearId ?? ''}
        onChange={onChange}
        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-800"
      >
        {years.map((y) => (
          <option key={y.id} value={y.id}>
            {y.label}
            {y.active ? ' ★' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
