'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { generateMultiTimetableAction } from './actions';
import { AllocationPanel } from './allocation-panel';

type ClassRow = {
  id: string;
  name: string;
  levelLabel: string;
  assignmentCount: number;
  entryCount: number;
};

type AnalysisData = {
  teachers: Array<{
    teacher_id: string;
    teacher_name: string;
    expected_hours: number;
    placed_hours: number;
    compatible_cells: number;
    utilization_pct: number;
    status: 'OK' | 'TIGHT' | 'DEFICIT' | 'UNDERLOADED';
    deficit_hours: number;
  }>;
  classes: Array<{
    class_id: string;
    class_name: string;
    expected_hours: number;
    placed_hours: number;
    missing_subjects: string[];
  }>;
  suggestions: string[];
};

type ResultData = {
  status: string;
  message: string;
  totalPlaced: number;
  consecutiveBlocks: number;
  solverTimeMs: number;
  byClass: Array<{
    classId: string;
    className: string;
    placed: number;
    unplaced: Array<{
      subject: string;
      placedHours: number;
      requestedHours: number;
      reason: string;
    }>;
  }>;
  analysis: AnalysisData | null;
};

export function GenerateGlobalForm({
  locale,
  academicYearId,
  classes,
}: {
  locale: string;
  academicYearId: string;
  classes: ClassRow[];
}) {
  const t = useTranslations('admin.timetable.generateMulti');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [engine, setEngine] = useState<'ortools' | 'fet'>('fet');
  const [selected, setSelected] = useState<Set<string>>(
    new Set(classes.filter((c) => c.assignmentCount > 0).map((c) => c.id)),
  );
  const [result, setResult] = useState<
    null | { ok: true; data: ResultData } | { ok: false; error: string }
  >(null);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = selected.size === classes.length;
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(classes.map((c) => c.id)));
  };

  const onConfirm = () => {
    setConfirmOpen(false);
    setResult(null);
    startTransition(async () => {
      const res = await generateMultiTimetableAction(academicYearId, [...selected], engine);
      setResult(res);
      if (res.ok) router.refresh();
    });
  };

  const willOverwrite = useMemo(
    () => classes.filter((c) => selected.has(c.id) && c.entryCount > 0).length,
    [classes, selected],
  );

  return (
    <>
      <section className="rounded-2xl border border-slate-200 bg-white">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-700">
            {t('classesHeader', { count: selected.size, total: classes.length })}
          </h2>
          <button
            type="button"
            onClick={toggleAll}
            className="text-brand-700 text-xs hover:underline"
          >
            {allSelected ? t('selectNone') : t('selectAll')}
          </button>
        </header>
        <ul className="divide-y divide-slate-100">
          {classes.map((c) => {
            const isSelected = selected.has(c.id);
            const noAssignments = c.assignmentCount === 0;
            return (
              <li key={c.id} className={noAssignments ? 'bg-slate-50/60' : ''}>
                <label className="flex cursor-pointer items-center gap-3 px-5 py-2.5 text-sm hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(c.id)}
                    className="h-4 w-4"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-slate-900">{c.name}</div>
                    <div className="text-xs text-slate-500">
                      {c.levelLabel}
                      {' · '}
                      {t('assignmentCount', { count: c.assignmentCount })}
                      {c.entryCount > 0 && (
                        <span className="ms-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">
                          {t('hasEntries', { count: c.entryCount })}
                        </span>
                      )}
                    </div>
                  </div>
                  <Link
                    href={`/${locale}/admin/classes/${c.id}/timetable`}
                    className="hover:text-brand-700 text-xs text-slate-400"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {t('viewClass')} →
                  </Link>
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Étape 2 — auto-affectation des profs avant génération */}
      <div className="mt-4">
        <AllocationPanel academicYearId={academicYearId} selectedIds={[...selected]} />
      </div>

      {/* Sélecteur de moteur */}
      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-1 text-sm font-semibold text-slate-700">{t('engineTitle')}</h2>
        <p className="mb-3 text-xs text-slate-500">{t('engineHint')}</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <EngineCard
            kind="fet"
            selected={engine === 'fet'}
            onSelect={() => setEngine('fet')}
            title={t('engine.fet.title')}
            description={t('engine.fet.description')}
            badge={t('engine.fet.badge')}
            badgeColor="emerald"
          />
          <EngineCard
            kind="ortools"
            selected={engine === 'ortools'}
            onSelect={() => setEngine('ortools')}
            title={t('engine.ortools.title')}
            description={t('engine.ortools.description')}
            badge={t('engine.ortools.badge')}
            badgeColor="blue"
          />
        </div>
      </section>

      <div className="mt-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-3">
        <p className="text-xs text-slate-500">
          {selected.size > 0 ? (
            <>
              {t('summary', { count: selected.size })}
              {willOverwrite > 0 && (
                <span className="ms-2 text-amber-700">
                  {t('summaryOverwrite', { count: willOverwrite })}
                </span>
              )}
              <span className="ms-2 text-slate-400">
                · {t('engineSummary', { engine: engine.toUpperCase() })}
              </span>
            </>
          ) : (
            t('summaryEmpty')
          )}
        </p>
        <button
          type="button"
          disabled={pending || selected.size === 0}
          onClick={() => setConfirmOpen(true)}
          className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {pending ? t('running') : `✨ ${t('runButton')}`}
        </button>
      </div>

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-slate-700">⚠ {t('confirmTitle')}</h3>
            <p className="mt-2 text-xs text-slate-600">
              {t('confirmBody', { count: selected.size, overwrite: willOverwrite })}
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-sm hover:bg-slate-50"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
              >
                {t('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {result && <ResultModal result={result} locale={locale} onClose={() => setResult(null)} />}
    </>
  );
}

function ResultModal({
  result,
  locale,
  onClose,
}: {
  result: { ok: true; data: ResultData } | { ok: false; error: string };
  locale: string;
  onClose: () => void;
}) {
  const t = useTranslations('admin.timetable.generateMulti');
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="my-8 max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {result.ok ? (
          <>
            <h3 className="text-sm font-semibold text-slate-700">
              {result.data.status === 'OPTIMAL' || result.data.status === 'FEASIBLE'
                ? `✅ ${t('resultOk')}`
                : `⚠ ${t('resultPartial')}`}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {result.data.message}
              <span className="ms-2 text-xs text-slate-400">
                ({result.data.solverTimeMs} ms
                {result.data.consecutiveBlocks > 0 && (
                  <>
                    {' · '}
                    {t('consecutiveBlocks', { count: result.data.consecutiveBlocks })}
                  </>
                )}
                )
              </span>
            </p>

            <ul className="mt-4 space-y-2">
              {result.data.byClass.map((c) => (
                <li
                  key={c.classId}
                  className={`rounded-lg border p-3 text-xs ${
                    c.unplaced.length > 0
                      ? 'border-amber-200 bg-amber-50'
                      : 'border-emerald-200 bg-emerald-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Link
                      href={`/${locale}/admin/classes/${c.classId}/timetable`}
                      className="hover:text-brand-700 font-medium text-slate-900 hover:underline"
                    >
                      {c.className}
                    </Link>
                    <span className="text-slate-600">
                      {t('placedHours', { count: c.placed })}
                      {c.unplaced.length > 0 && (
                        <span className="ms-2 text-amber-700">
                          · {t('unplacedCount', { count: c.unplaced.length })}
                        </span>
                      )}
                    </span>
                  </div>
                  {c.unplaced.length > 0 && (
                    <ul className="mt-2 list-disc ps-5 text-[11px] text-slate-700">
                      {c.unplaced.map((u, i) => (
                        <li key={i}>
                          <strong>{u.subject}</strong> ({u.placedHours}/{u.requestedHours} h) —{' '}
                          {u.reason}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>

            {result.data.analysis && <AnalysisPanel analysis={result.data.analysis} />}
          </>
        ) : (
          <>
            <h3 className="text-sm font-semibold text-red-700">❌ {t('resultError')}</h3>
            <p className="mt-2 text-sm text-red-800">{result.error}</p>
          </>
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="bg-brand-600 hover:bg-brand-700 rounded-lg px-4 py-1.5 text-sm font-medium text-white"
          >
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
}

function AnalysisPanel({ analysis }: { analysis: AnalysisData }) {
  const t = useTranslations('admin.timetable.generateMulti.analysis');

  // On affiche le panneau seulement s'il y a quelque chose d'intéressant
  const interestingTeachers = analysis.teachers.filter(
    (td) => td.status === 'DEFICIT' || td.status === 'TIGHT',
  );
  const hasContent =
    analysis.suggestions.length > 0 ||
    interestingTeachers.length > 0 ||
    analysis.classes.length > 0;
  if (!hasContent) return null;

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
      <h4 className="mb-3 text-sm font-semibold text-slate-700">🔍 {t('title')}</h4>

      {/* Suggestions actionables */}
      {analysis.suggestions.length > 0 && (
        <div className="mb-4">
          <h5 className="mb-2 text-[11px] font-semibold uppercase text-slate-500">
            {t('suggestions')}
          </h5>
          <ul className="space-y-2">
            {analysis.suggestions.map((s, i) => (
              <li
                key={i}
                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
              >
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Profs saturés / en déficit */}
      {interestingTeachers.length > 0 && (
        <div className="mb-3">
          <h5 className="mb-2 text-[11px] font-semibold uppercase text-slate-500">
            {t('teacherLoad')}
          </h5>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-start">{t('teacher')}</th>
                  <th className="px-3 py-2 text-end">{t('expected')}</th>
                  <th className="px-3 py-2 text-end">{t('placed')}</th>
                  <th className="px-3 py-2 text-end">{t('capacity')}</th>
                  <th className="px-3 py-2 text-end">{t('utilization')}</th>
                  <th className="px-3 py-2 text-start">{t('status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {interestingTeachers.map((td) => (
                  <tr key={td.teacher_id}>
                    <td className="px-3 py-1.5 font-medium text-slate-900">{td.teacher_name}</td>
                    <td className="px-3 py-1.5 text-end tabular-nums">{td.expected_hours} h</td>
                    <td className="px-3 py-1.5 text-end tabular-nums">{td.placed_hours} h</td>
                    <td className="px-3 py-1.5 text-end tabular-nums">{td.compatible_cells}</td>
                    <td className="px-3 py-1.5 text-end tabular-nums">
                      <span
                        className={
                          td.utilization_pct >= 95
                            ? 'text-red-700'
                            : td.utilization_pct >= 90
                              ? 'text-amber-700'
                              : 'text-slate-700'
                        }
                      >
                        {td.utilization_pct}%
                      </span>
                    </td>
                    <td className="px-3 py-1.5">
                      <StatusBadge status={td.status} t={t} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="mt-2 text-[10px] text-slate-400">{t('helpHint')}</p>
    </section>
  );
}

function StatusBadge({
  status,
  t,
}: {
  status: 'OK' | 'TIGHT' | 'DEFICIT' | 'UNDERLOADED';
  t: (k: string) => string;
}) {
  const map = {
    OK: 'bg-emerald-100 text-emerald-700',
    TIGHT: 'bg-amber-100 text-amber-700',
    DEFICIT: 'bg-red-100 text-red-700',
    UNDERLOADED: 'bg-slate-100 text-slate-600',
  } as const;
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${map[status]}`}>
      {t(`statusLabel.${status}`)}
    </span>
  );
}

function EngineCard({
  kind,
  selected,
  onSelect,
  title,
  description,
  badge,
  badgeColor,
}: {
  kind: 'ortools' | 'fet';
  selected: boolean;
  onSelect: () => void;
  title: string;
  description: string;
  badge: string;
  badgeColor: 'emerald' | 'blue';
}) {
  const badgeClass =
    badgeColor === 'emerald' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700';
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative cursor-pointer rounded-2xl border p-4 text-start transition-all ${
        selected
          ? 'border-brand-500 bg-brand-50/50 ring-brand-200 ring-2'
          : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <span
            className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${badgeClass}`}
          >
            {badge}
          </span>
        </div>
        {selected && <span className="text-brand-700">●</span>}
      </div>
      <p className="mt-2 text-xs text-slate-600">{description}</p>
      <p className="mt-1 text-[10px] uppercase text-slate-400">{kind}</p>
    </button>
  );
}
