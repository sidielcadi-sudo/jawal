'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

type PeriodOpt = { id: string; label: string };

export function PeriodSelect({
  periods,
  selectedPeriodId,
}: {
  periods: PeriodOpt[];
  selectedPeriodId: string | null;
}) {
  const t = useTranslations('admin.dashboard');
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(sp.toString());
    params.set('period', e.target.value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <label className="flex items-center gap-2">
      <span className="text-xs font-medium text-slate-600">{t('period')}</span>
      <select
        value={selectedPeriodId ?? ''}
        onChange={onChange}
        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-800"
      >
        {periods.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
    </label>
  );
}
