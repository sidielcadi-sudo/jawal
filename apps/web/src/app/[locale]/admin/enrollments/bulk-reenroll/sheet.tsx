'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { bulkReenrollAction } from '../actions';
import { personDisplayName } from '@/lib/localized-name';

export type YearOpt = { id: string; label: string; active: boolean };
export type LevelOpt = {
  id: string;
  label: string;
  cycleId: string;
  cycleLabel: string;
  order: number;
  cycle: { id: string; order: number };
};
export type Row = {
  sourceEnrollmentId: string;
  studentId: string;
  firstName: string;
  lastName: string;
  firstNameAr: string | null;
  lastNameAr: string | null;
  currentLevelId: string;
  currentLevelLabel: string;
  currentClassName: string | null;
  currentStatus: 'ACTIVE' | 'DRAFT';
  suggestedNextLevelId: string | null;
  suggestedNextLevelLabel: string | null;
  existingTargetStatus: 'DRAFT' | 'ACTIVE' | 'WITHDRAWN' | 'GRADUATED' | null;
};

type Decision = 'REENROLL' | 'REPEAT' | 'GRADUATE' | 'SKIP';

type ItemState = {
  decision: Decision;
  targetLevelId: string;
};

export function BulkReenrollSheet({
  locale,
  years,
  levels,
  sourceYearId,
  targetYearId,
  rows,
}: {
  locale: string;
  years: YearOpt[];
  levels: LevelOpt[];
  sourceYearId: string;
  targetYearId: string;
  rows: Row[];
}) {
  const t = useTranslations('admin.enrollments.bulk');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<
    | null
    | { ok: true; created: number; graduated: number; skipped: number; errors: string[] }
    | { ok: false; error: string }
  >(null);

  // État local : pour chaque row, sa décision + niveau cible
  const [items, setItems] = useState<Record<string, ItemState>>(() => {
    const initial: Record<string, ItemState> = {};
    for (const r of rows) {
      // Si dossier déjà existant sur cible → SKIP par défaut
      const defaultDecision: Decision = r.existingTargetStatus
        ? 'SKIP'
        : r.suggestedNextLevelId
          ? 'REENROLL'
          : 'GRADUATE';
      initial[r.sourceEnrollmentId] = {
        decision: defaultDecision,
        targetLevelId: r.suggestedNextLevelId ?? r.currentLevelId,
      };
    }
    return initial;
  });

  // Filtres de confort : ils ne portent que sur l'affichage et sur la portée
  // des boutons « appliquer à tous ». Les décisions des lignes masquées sont
  // conservées et partent quand même à l'enregistrement.
  const [classFilter, setClassFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');

  const classOptions = useMemo(
    () =>
      [...new Set(rows.map((r) => r.currentClassName).filter((c): c is string => !!c))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [rows],
  );
  const levelOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) if (!seen.has(r.currentLevelId)) seen.set(r.currentLevelId, r.currentLevelLabel);
    return [...seen].map(([id, label]) => ({ id, label }));
  }, [rows]);

  const visibleRows = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!classFilter || r.currentClassName === classFilter) &&
          (!levelFilter || r.currentLevelId === levelFilter),
      ),
    [rows, classFilter, levelFilter],
  );
  const filtered = visibleRows.length !== rows.length;

  const counts = useMemo(() => {
    let reenroll = 0;
    let repeat = 0;
    let graduate = 0;
    let skip = 0;
    for (const it of Object.values(items)) {
      if (it.decision === 'REENROLL') reenroll += 1;
      else if (it.decision === 'REPEAT') repeat += 1;
      else if (it.decision === 'GRADUATE') graduate += 1;
      else skip += 1;
    }
    return { reenroll, repeat, graduate, skip };
  }, [items]);

  const update = (id: string, patch: Partial<ItemState>) =>
    setItems((prev) => ({ ...prev, [id]: { ...prev[id]!, ...patch } }));

  const applyAll = (decision: Decision) => {
    const scope = new Set(visibleRows.map((r) => r.sourceEnrollmentId));
    setItems((prev) => {
      const next: Record<string, ItemState> = {};
      for (const id of Object.keys(prev)) {
        next[id] = scope.has(id) ? { ...prev[id]!, decision } : prev[id]!;
      }
      return next;
    });
  };

  const submit = () => {
    setResult(null);
    if (!targetYearId) {
      setResult({ ok: false, error: t('selectTargetYear') });
      return;
    }
    const payload = {
      sourceYearId,
      targetYearId,
      items: Object.entries(items).map(([sourceEnrollmentId, it]) => ({
        sourceEnrollmentId,
        decision: it.decision,
        targetLevelId:
          it.decision === 'REENROLL' || it.decision === 'REPEAT'
            ? it.targetLevelId
            : undefined,
      })),
    };
    const fd = new FormData();
    fd.append('payload', JSON.stringify(payload));
    startTransition(async () => {
      const res = await bulkReenrollAction(fd);
      if (!res.ok) {
        setResult({ ok: false, error: res.error });
      } else if (res.data) {
        setResult({ ok: true, ...res.data });
        router.refresh();
      }
    });
  };

  const onChangeYear = (kind: 'source' | 'target', value: string) => {
    const params = new URLSearchParams();
    params.set('source', kind === 'source' ? value : sourceYearId);
    if ((kind === 'target' ? value : targetYearId) !== '') {
      params.set('target', kind === 'target' ? value : targetYearId);
    }
    router.push(`/${locale}/admin/enrollments/bulk-reenroll?${params.toString()}`);
  };

  return (
    <div className="mt-6">
      {/* Sélecteurs année */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('sourceYear')}>
          <select
            value={sourceYearId}
            onChange={(e) => onChangeYear('source', e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.label}
                {y.active ? ' ★' : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('targetYear')}>
          <select
            value={targetYearId}
            onChange={(e) => onChangeYear('target', e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">{t('targetYearPlaceholder')}</option>
            {years
              .filter((y) => y.id !== sourceYearId)
              .map((y) => (
                <option key={y.id} value={y.id}>
                  {y.label}
                  {y.active ? ' ★' : ''}
                </option>
              ))}
          </select>
        </Field>
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
          {t('noSourceEnrollments')}
        </div>
      ) : (
        <>
          {/* Récap décisions */}
          <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <KpiBox label={t('counter.reenroll')} value={counts.reenroll} color="emerald" />
            <KpiBox label={t('counter.repeat')} value={counts.repeat} color="amber" />
            <KpiBox label={t('counter.graduate')} value={counts.graduate} color="blue" />
            <KpiBox label={t('counter.skip')} value={counts.skip} color="slate" />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t('filter.currentClass')}>
              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">{t('filter.allClasses')}</option>
                {classOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('filter.currentLevel')}>
              <select
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">{t('filter.allLevels')}</option>
                {levelOptions.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {filtered && (
            <p className="mt-2 text-xs text-amber-700">
              {t('filter.active', { shown: visibleRows.length, total: rows.length })}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500">{t('applyAll')} :</span>
            <button
              type="button"
              onClick={() => applyAll('REENROLL')}
              className="rounded-md border border-emerald-200 bg-white px-2 py-1 text-emerald-700 hover:bg-emerald-50"
            >
              ✓ {t('decision.REENROLL')}
            </button>
            <button
              type="button"
              onClick={() => applyAll('REPEAT')}
              className="rounded-md border border-amber-200 bg-white px-2 py-1 text-amber-700 hover:bg-amber-50"
            >
              ↻ {t('decision.REPEAT')}
            </button>
            <button
              type="button"
              onClick={() => applyAll('GRADUATE')}
              className="rounded-md border border-blue-200 bg-white px-2 py-1 text-blue-700 hover:bg-blue-50"
            >
              🎓 {t('decision.GRADUATE')}
            </button>
            <button
              type="button"
              onClick={() => applyAll('SKIP')}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-700 hover:bg-slate-50"
            >
              ⊘ {t('decision.SKIP')}
            </button>
          </div>

          {/* Tableau */}
          <div className="mt-3 overflow-hidden rounded-2xl border border-brand-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
                <tr>
                  <th className="px-3 py-3 text-start">{t('table.student')}</th>
                  <th className="px-3 py-3 text-start">{t('table.current')}</th>
                  <th className="px-3 py-3 text-start">{t('table.decision')}</th>
                  <th className="px-3 py-3 text-start">{t('table.targetLevel')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRows.map((r) => {
                  const state = items[r.sourceEnrollmentId]!;
                  const disabled = !!r.existingTargetStatus;
                  return (
                    <tr
                      key={r.sourceEnrollmentId}
                      className={disabled ? 'bg-slate-50/60 opacity-60' : ''}
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900">
                          {personDisplayName(locale, r)}
                        </div>
                        {r.existingTargetStatus && (
                          <div className="mt-0.5 text-[10px] text-amber-700">
                            {t('alreadyExistsOnTarget', { status: r.existingTargetStatus })}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600">
                        <div>{r.currentLevelLabel}</div>
                        <div className="text-[11px] text-slate-400">
                          {r.currentClassName ?? '—'} · {r.currentStatus}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          disabled={disabled}
                          value={state.decision}
                          onChange={(e) =>
                            update(r.sourceEnrollmentId, {
                              decision: e.target.value as Decision,
                            })
                          }
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                        >
                          <option value="REENROLL">✓ {t('decision.REENROLL')}</option>
                          <option value="REPEAT">↻ {t('decision.REPEAT')}</option>
                          <option value="GRADUATE">🎓 {t('decision.GRADUATE')}</option>
                          <option value="SKIP">⊘ {t('decision.SKIP')}</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        {state.decision === 'REENROLL' ? (
                          <select
                            disabled={disabled}
                            value={state.targetLevelId}
                            onChange={(e) =>
                              update(r.sourceEnrollmentId, { targetLevelId: e.target.value })
                            }
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                          >
                            {levels.map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.cycleLabel} · {l.label}
                                {l.id === r.suggestedNextLevelId ? ' ★' : ''}
                              </option>
                            ))}
                          </select>
                        ) : state.decision === 'REPEAT' ? (
                          <span className="text-xs text-slate-500">
                            {r.currentLevelLabel}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">{t('execHint')}</p>
            <button
              type="button"
              disabled={pending || !targetYearId}
              onClick={submit}
              className="rounded-lg bg-brand-600 px-6 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {pending ? t('executing') : t('execute')}
            </button>
          </div>

          {result && (
            <div
              className={`mt-4 rounded-2xl border px-5 py-4 text-sm ${
                result.ok
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-red-200 bg-red-50 text-red-900'
              }`}
            >
              {result.ok ? (
                <>
                  <strong>{t('resultOk')}</strong>{' '}
                  {t('resultDetails', {
                    created: result.created,
                    graduated: result.graduated,
                    skipped: result.skipped,
                  })}
                  {result.errors.length > 0 && (
                    <ul className="mt-2 list-disc ps-5 text-xs">
                      {result.errors.slice(0, 10).map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <>
                  <strong>{t('resultErr')}</strong> {result.error}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium uppercase text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function KpiBox({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: 'emerald' | 'amber' | 'blue' | 'slate';
}) {
  const map = {
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
    blue: 'text-blue-700',
    slate: 'text-slate-600',
  } as const;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
      <div className={`text-2xl font-semibold tabular-nums ${map[color]}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
