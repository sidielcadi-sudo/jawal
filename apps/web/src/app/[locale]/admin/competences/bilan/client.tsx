'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { freezeClassReportsAction } from './actions';

type Opt = { id: string; label: string };

const cls =
  'rounded-lg border border-slate-300 px-3 py-1.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none';

export function BilanFilters({
  classes,
  classId,
  periods,
  periodId,
}: {
  classes: Opt[];
  classId: string;
  periods: Opt[];
  periodId: string;
}) {
  const t = useTranslations('admin.competences');
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const go = (k: string, v: string) => {
    const p = new URLSearchParams(search.toString());
    p.set(k, v);
    router.push(`${pathname}?${p.toString()}`);
  };
  return (
    <div className="flex flex-wrap items-end gap-3">
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
        <select value={periodId} onChange={(e) => go('period', e.target.value)} className={`mt-1 ${cls}`}>
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** Gel du bilan : rend le trimestre reproductible pour le bulletin. */
export function FreezeButton({
  classId,
  periodId,
  frozenAt,
}: {
  classId: string;
  periodId: string;
  frozenAt: string | null;
}) {
  const t = useTranslations('admin.competences');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg(null);
            const r = await freezeClassReportsAction(classId, periodId);
            if (!r.ok) return setMsg({ ok: false, text: r.error });
            setMsg({ ok: true, text: t('frozenDone', { count: r.frozen ?? 0 }) });
            router.refresh();
          })
        }
        className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        🔒 {frozenAt ? t('refreeze') : t('freeze')}
      </button>
      {frozenAt && !msg && <span className="text-xs text-slate-500">{t('frozenAt', { date: frozenAt })}</span>}
      {msg && <span className={`text-xs ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{msg.text}</span>}
    </div>
  );
}
