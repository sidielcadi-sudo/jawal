'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

type Opt = { id: string; label: string };

const cls =
  'rounded-lg border border-slate-300 px-3 py-1.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none';

/** Filtres classe / période / matière — navigation par query string. */
export function GridSelectors({
  classes,
  classId,
  periods,
  periodId,
  subjects,
  subjectId,
}: {
  classes: Opt[];
  classId: string;
  periods: Opt[];
  periodId: string | null;
  subjects: Opt[];
  subjectId: string | null;
}) {
  const t = useTranslations('enseignant.competences');
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const go = (key: string, value: string) => {
    const p = new URLSearchParams(search.toString());
    p.set(key, value);
    if (key === 'class') p.delete('subject'); // la matière peut changer selon la classe
    router.push(`${pathname}?${p.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-brand-200 bg-white px-4 py-3">
      <label className="text-sm">
        <span className="block text-xs text-slate-500">{t('class')}</span>
        <select value={classId} onChange={(e) => go('class', e.target.value)} className={`mt-1 ${cls}`}>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm">
        <span className="block text-xs text-slate-500">{t('period')}</span>
        <select value={periodId ?? ''} onChange={(e) => go('period', e.target.value)} className={`mt-1 ${cls}`}>
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      {subjects.length > 0 && (
        <label className="text-sm">
          <span className="block text-xs text-slate-500">{t('grid.subject')}</span>
          <select value={subjectId ?? ''} onChange={(e) => go('subject', e.target.value)} className={`mt-1 ${cls}`}>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
