'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  proposeAllocationAction,
  applyAllocationAction,
  previewResetAllocationAction,
  resetAllocationAction,
} from './actions';

type Reason = 'PINNED' | 'PRIORITY' | 'BALANCED' | 'NO_SPECIALIST' | 'OVER_CAPACITY';
type Proposal = {
  classId: string;
  className: string;
  subjectId: string;
  subjectLabel: string;
  hours: number;
  teacherId: string | null;
  teacherName: string | null;
  reason: Reason;
  pinned: boolean;
};
type Plan = {
  proposals: Proposal[];
  teacherLoads: { teacherId: string; name: string; contractual: number | null; assigned: number }[];
  candidatesByKey: Record<string, { id: string; name: string }[]>;
};

const REASON_BADGE: Record<Reason, string> = {
  PINNED: 'bg-slate-100 text-slate-600',
  PRIORITY: 'bg-brand-100 text-brand-700',
  BALANCED: 'bg-blue-50 text-blue-700',
  NO_SPECIALIST: 'bg-red-100 text-red-700',
  OVER_CAPACITY: 'bg-amber-100 text-amber-800',
};

const keyOf = (c: string, s: string) => `${c}|${s}`;

export function AllocationPanel({
  academicYearId,
  selectedIds,
}: {
  academicYearId: string;
  selectedIds: string[];
}) {
  const t = useTranslations('admin.timetable.allocation');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [applied, setApplied] = useState<number | null>(null);
  /** Décompte de ce que la réinitialisation détruirait, avant confirmation. */
  const [resetPreview, setResetPreview] = useState<
    { assignments: number; entries: number; classes: number } | null
  >(null);

  function propose() {
    setError('');
    setApplied(null);
    startTransition(async () => {
      const r = await proposeAllocationAction(academicYearId, selectedIds);
      if (!r.ok) {
        setError(r.error);
        setPlan(null);
        return;
      }
      setOverrides({});
      setPlan(r.plan as Plan);
    });
  }

  /**
   * Étape 1 : on compte ce qui va disparaître et on l'affiche. Le
   * `window.confirm` d'avant ne disait pas combien de lignes partaient, et
   * rien ne les restaure.
   */
  function askReset() {
    setError('');
    startTransition(async () => {
      const r = await previewResetAllocationAction(academicYearId, selectedIds);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setResetPreview({ assignments: r.assignments, entries: r.entries, classes: r.classes });
    });
  }

  /** Étape 2 : l'utilisateur a vu les chiffres et confirme. */
  function reset() {
    setResetPreview(null);
    setError('');
    setApplied(null);
    startTransition(async () => {
      const r = await resetAllocationAction(academicYearId, selectedIds);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      // Repropose à neuf : plus rien n'est épinglé.
      const p = await proposeAllocationAction(academicYearId, selectedIds);
      if (!p.ok) {
        setError(p.error);
        setPlan(null);
        return;
      }
      setOverrides({});
      setPlan(p.plan as Plan);
    });
  }

  function teacherFor(p: Proposal): string {
    return overrides[keyOf(p.classId, p.subjectId)] ?? p.teacherId ?? '';
  }

  function apply() {
    if (!plan) return;
    const decisions = plan.proposals
      .filter((p) => !p.pinned)
      .map((p) => ({
        classId: p.classId,
        subjectId: p.subjectId,
        teacherId: teacherFor(p),
        hours: p.hours,
      }))
      .filter((d) => d.teacherId);
    if (decisions.length === 0) {
      setError(t('nothingToApply'));
      return;
    }
    setError('');
    startTransition(async () => {
      const r = await applyAllocationAction(academicYearId, decisions);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setApplied(r.created);
      setPlan(null);
      router.refresh();
    });
  }

  const counts = plan
    ? {
        toCreate: plan.proposals.filter((p) => !p.pinned && teacherFor(p)).length,
        pinned: plan.proposals.filter((p) => p.pinned).length,
        noSpecialist: plan.proposals.filter((p) => p.reason === 'NO_SPECIALIST').length,
        over: plan.proposals.filter((p) => p.reason === 'OVER_CAPACITY').length,
      }
    : null;

  return (
    <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{t('title')}</h3>
          <p className="mt-0.5 text-xs text-slate-500">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={askReset}
            disabled={pending || selectedIds.length === 0}
            className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {t('reset')}
          </button>
          <button
            type="button"
            onClick={propose}
            disabled={pending || selectedIds.length === 0}
            className="border-brand-300 bg-brand-50 text-brand-700 hover:bg-brand-100 rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            {pending && !plan ? t('computing') : t('propose')}
          </button>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {applied !== null && (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {t('applied', { count: applied })}
        </p>
      )}

      {plan && counts && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2 text-xs">
            <Stat label={t('toCreate')} value={counts.toCreate} cls="bg-brand-50 text-brand-700" />
            <Stat
              label={t('pinnedCount')}
              value={counts.pinned}
              cls="bg-slate-100 text-slate-600"
            />
            {counts.noSpecialist > 0 && (
              <Stat
                label={t('noSpecialistCount')}
                value={counts.noSpecialist}
                cls="bg-red-100 text-red-700"
              />
            )}
            {counts.over > 0 && (
              <Stat label={t('overCount')} value={counts.over} cls="bg-amber-100 text-amber-800" />
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead className="table-head text-[10px] uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-start">{t('class')}</th>
                  <th className="px-3 py-2 text-start">{t('subject')}</th>
                  <th className="px-3 py-2 text-end">{t('hours')}</th>
                  <th className="px-3 py-2 text-start">{t('teacher')}</th>
                  <th className="px-3 py-2 text-start">{t('reason')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {plan.proposals.map((p) => {
                  const k = keyOf(p.classId, p.subjectId);
                  const cands = plan.candidatesByKey[k] ?? [];
                  return (
                    <tr key={k}>
                      <td className="px-3 py-1.5 font-medium text-slate-900">{p.className}</td>
                      <td className="px-3 py-1.5 text-slate-700">{p.subjectLabel}</td>
                      <td className="px-3 py-1.5 text-end tabular-nums text-slate-600">
                        {p.hours}
                      </td>
                      <td className="px-3 py-1.5">
                        {p.pinned ? (
                          <span className="text-slate-700">🔒 {p.teacherName}</span>
                        ) : cands.length === 0 ? (
                          <span className="text-red-600">{t('noSpecialist')}</span>
                        ) : (
                          <select
                            value={teacherFor(p)}
                            onChange={(e) => setOverrides((o) => ({ ...o, [k]: e.target.value }))}
                            className="rounded border border-slate-300 px-1.5 py-1 text-xs"
                          >
                            <option value="">—</option>
                            {cands.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${REASON_BADGE[p.reason]}`}
                        >
                          {t(`reasons.${p.reason}`)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {plan.teacherLoads.length > 0 && (
            <div>
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase text-slate-500">
                {t('loads')}
              </h4>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {plan.teacherLoads.map((l) => {
                  const cap = l.contractual ?? 0;
                  const pct = cap > 0 ? Math.min(100, Math.round((l.assigned / cap) * 100)) : 0;
                  const over = cap > 0 && l.assigned > cap;
                  return (
                    <div key={l.teacherId} className="flex items-center gap-2 text-xs">
                      <span className="w-36 shrink-0 truncate text-slate-700">{l.name}</span>
                      <div className="relative h-2.5 flex-1 overflow-hidden rounded bg-slate-100">
                        <div
                          className={`h-full ${over ? 'bg-amber-500' : 'bg-brand-400'}`}
                          style={{ width: `${cap > 0 ? Math.min(100, pct) : 0}%` }}
                        />
                      </div>
                      <span
                        className={`w-14 shrink-0 text-end tabular-nums ${over ? 'text-amber-700' : 'text-slate-500'}`}
                      >
                        {l.assigned}/{l.contractual ?? '—'}h
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={apply}
              disabled={pending || counts.toCreate === 0}
              className="bg-brand-600 hover:bg-brand-700 rounded-lg px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-50"
            >
              {pending ? t('applying') : t('apply', { count: counts.toCreate })}
            </button>
          </div>
        </div>
      )}
      {/* Confirmation chiffrée : une suppression irréversible doit annoncer ce
          qu'elle emporte, pas seulement se déclarer irréversible. */}
      {resetPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setResetPreview(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-red-800">{t('resetTitle')}</h3>
            <p className="mt-2 text-sm text-slate-700">
              {t('resetBody', {
                classes: resetPreview.classes,
                assignments: resetPreview.assignments,
                entries: resetPreview.entries,
              })}
            </p>
            <p className="mt-2 text-xs text-red-700">{t('resetIrreversible')}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResetPreview(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-sm hover:bg-slate-50"
              >
                {t('resetCancel')}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={reset}
                className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {t('resetConfirmAction')}
              </button>
            </div>
          </div>
        </div>
      )}

    </section>
  );
}

function Stat({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <span className={`rounded-lg px-2 py-1 font-medium ${cls}`}>
      {value} {label}
    </span>
  );
}
