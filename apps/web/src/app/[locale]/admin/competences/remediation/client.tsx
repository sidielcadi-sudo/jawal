'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { enrollSupportStudentAction } from '../../soutien/actions';

type Opt = { id: string; label: string };
type Item = Opt & { group: string };

const cls =
  'rounded-lg border border-slate-300 px-3 py-1.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none';

export function RemediationFilters({
  items,
  nodeId,
  periods,
  periodId,
  levels,
  levelId,
  scale,
  maxValue,
}: {
  items: Item[];
  nodeId: string;
  periods: Opt[];
  periodId: string;
  levels: Opt[];
  levelId: string | null;
  scale: { value: number; label: string }[];
  maxValue: number;
}) {
  const t = useTranslations('admin.competences');
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const go = (k: string, v: string) => {
    const p = new URLSearchParams(search.toString());
    if (v) p.set(k, v);
    else p.delete(k);
    router.push(`${pathname}?${p.toString()}`);
  };
  const groups = [...new Set(items.map((i) => i.group))];

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="min-w-[16rem] flex-1 text-sm">
        <span className="block text-xs text-slate-500">{t('competencyToRemediate')}</span>
        <select value={nodeId} onChange={(e) => go('node', e.target.value)} className={`mt-1 w-full ${cls}`}>
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {items
                .filter((i) => i.group === g)
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label}
                  </option>
                ))}
            </optgroup>
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

      <label className="text-sm">
        <span className="block text-xs text-slate-500">{t('levelFilter')}</span>
        <select value={levelId ?? ''} onChange={(e) => go('level', e.target.value)} className={`mt-1 ${cls}`}>
          <option value="">{t('allLevels')}</option>
          {levels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm">
        <span className="block text-xs text-slate-500">{t('threshold')}</span>
        <select
          value={String(maxValue)}
          onChange={(e) => go('max', e.target.value)}
          className={`mt-1 ${cls}`}
        >
          {scale
            .filter((s) => s.value < Math.max(...scale.map((x) => x.value)))
            .map((s) => (
              <option key={s.value} value={s.value}>
                ≤ {s.label}
              </option>
            ))}
        </select>
      </label>
    </div>
  );
}

/** Constitue un groupe de soutien à partir des élèves listés. */
export function EnrollGroup({ courses, studentIds }: { courses: Opt[]; studentIds: string[] }) {
  const t = useTranslations('admin.competences');
  const router = useRouter();
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '');
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (courses.length === 0) return <span className="text-xs text-slate-400">{t('noCourse')}</span>;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className={cls}>
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={pending || !courseId}
        onClick={() =>
          start(async () => {
            setMsg(null);
            let ok = 0;
            let failed = 0;
            for (const id of studentIds) {
              // `recommended = true` : l'inscription vient d'un constat de non-acquisition.
              const r = await enrollSupportStudentAction(courseId, id, true);
              if (r.ok) ok++;
              else failed++;
            }
            setMsg({ ok: failed === 0, text: t('enrolled', { count: ok, failed }) });
            router.refresh();
          })
        }
        className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {pending ? t('enrolling') : t('enrollGroup', { count: studentIds.length })}
      </button>
      {msg && <span className={`text-xs ${msg.ok ? 'text-emerald-700' : 'text-amber-700'}`}>{msg.text}</span>}
    </div>
  );
}
