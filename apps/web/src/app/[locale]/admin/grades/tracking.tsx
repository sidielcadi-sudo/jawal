'use client';

import { KpiCard } from '@/components/kpi-card';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { EXAM_KIND_GROUPS, type ExamKindGroup } from '@/lib/exam-kinds';
import {
  averageDelta,
  kindFamily,
  matchesSearch,
  summarize,
  type TrackingRow,
} from '@/lib/grades-tracking';
import { remindGradeEntryAction } from './actions';

export type PeriodGroup = { yearLabel: string; periods: Array<{ id: string; label: string }> };

const KIND_TONE: Record<string, string> = {
  CONTROLE_CONTINU: 'bg-emerald-50 text-emerald-800',
  DEVOIR_SURVEILLE: 'bg-indigo-50 text-indigo-800',
  DEVOIR_MAISON: 'bg-sky-50 text-sky-800',
  BLANC: 'bg-rose-50 text-rose-700',
  COMPOSITION: 'bg-rose-50 text-rose-700',
  SEMESTRIEL: 'bg-rose-50 text-rose-700',
  REGIONAL: 'bg-amber-50 text-amber-800',
  NATIONAL: 'bg-amber-50 text-amber-800',
};

/**
 * Suivi des épreuves : indicateurs, filtres et tableau.
 *
 * La période et la classe passent par l'URL — les autres blocs de la page en
 * dépendent. Le type et la recherche filtrent sur place : les indicateurs se
 * recalculent sur ce qui reste affiché.
 */
export function GradesTracking({
  locale,
  rows,
  prevRows,
  periodGroups,
  periodId,
  classes,
  classId,
  canRemind,
}: {
  locale: string;
  rows: TrackingRow[];
  prevRows: TrackingRow[];
  periodGroups: PeriodGroup[];
  periodId: string;
  classes: Array<{ id: string; label: string }>;
  classId: string;
  /** Relancer n'a de sens que sur l'année en cours : on ne réclame pas les notes d'un exercice clos. */
  canRemind: boolean;
}) {
  const t = useTranslations('admin.gradesOverview.tracking');
  const tKinds = useTranslations('admin.exams.kinds');
  const tCat = useTranslations('admin.exams.categories');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState<ExamKindGroup | ''>('');

  const keep = (r: TrackingRow) => (!family || kindFamily(r.kind) === family) && matchesSearch(r, query);
  const visible = useMemo(() => rows.filter(keep), [rows, family, query]); // eslint-disable-line react-hooks/exhaustive-deps
  const summary = useMemo(() => summarize(visible), [visible]);
  const previous = useMemo(() => summarize(prevRows.filter(keep)), [prevRows, family, query]); // eslint-disable-line react-hooks/exhaustive-deps
  const delta = averageDelta(summary.average, previous.average);

  const num = (n: number) => n.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  function navigate(key: 'period' | 'class', value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`${pathname}?${next.toString()}`);
  }

  const selectCls =
    'rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 focus:border-brand-500 focus:outline-none';

  return (
    <div className="space-y-4">
      {/* ── Indicateurs ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon="📈"
          tone="sky"
          label={t('kpi.average')}
          value={summary.average === null ? null : `${num(summary.average)} / 20`}
          hint={
            summary.average === null
              ? undefined
              : delta === null
                ? t('kpi.noPrevious')
                : `${delta >= 0 ? '↗ +' : '↘ '}${num(delta)} pt · ${t('kpi.vsPrevious')}`
          }
        />
        <KpiCard
          icon="📅"
          tone="violet"
          label={t('kpi.scheduled')}
          value={t('kpi.scheduledValue', { count: summary.total })}
          hint={`${t('kpi.controls', { count: summary.controls })} · ${t('kpi.exams', { count: summary.exams })}`}
        />
        <KpiCard
          icon="✍"
          tone="amber"
          label={t('kpi.completion')}
          value={summary.completion === null ? null : `${num(summary.completion)} %`}
          alert={summary.late > 0}
          hint={summary.late > 0 ? t('kpi.late', { count: summary.late }) : t('kpi.noLate')}
        />
        <KpiCard
          icon="🏅"
          tone="emerald"
          label={t('kpi.success')}
          value={summary.success === null ? null : `${num(summary.success)} %`}
          hint={t('kpi.validated', { passed: summary.passed, count: summary.count })}
        />
      </div>

      {/* ── Filtres ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-center">
        <label className="relative flex-1">
          <span className="pointer-events-none absolute inset-y-0 start-3 grid place-items-center text-slate-400">
            <IconSearch />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search')}
            className="w-full rounded-xl border border-slate-300 py-2.5 pe-3 ps-10 text-sm focus:border-brand-500 focus:outline-none"
          />
        </label>
        <select value={periodId} onChange={(e) => navigate('period', e.target.value)} className={selectCls}>
          {periodGroups.map((g) => (
            <optgroup key={g.yearLabel} label={g.yearLabel}>
              {g.periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <select value={classId} onChange={(e) => navigate('class', e.target.value)} className={selectCls}>
          <option value="">{t('allClasses')}</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          value={family}
          onChange={(e) => setFamily(e.target.value as ExamKindGroup | '')}
          className={selectCls}
        >
          <option value="">{t('allKinds')}</option>
          {EXAM_KIND_GROUPS.map((g) => (
            <option key={g.key} value={g.key}>
              {tCat(g.key)}
            </option>
          ))}
        </select>
      </div>

      {/* ── Tableau ─────────────────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 text-start font-medium">{t('col.label')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('col.class')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('col.teacher')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('col.date')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('col.coefficient')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('col.entry')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('col.average')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('col.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((r) => (
                <Row
                  key={`${r.source}:${r.id}`}
                  r={r}
                  locale={locale}
                  kindLabel={tKinds(r.kind)}
                  num={num}
                  canRemind={canRemind}
                />
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                    {rows.length === 0 ? t('empty') : t('noMatch')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Row({
  r,
  locale,
  kindLabel,
  num,
  canRemind,
}: {
  r: TrackingRow;
  locale: string;
  kindLabel: string;
  num: (n: number) => string;
  canRemind: boolean;
}) {
  const t = useTranslations('admin.gradesOverview.tracking');
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const pct = r.expected > 0 ? Math.min(100, Math.round((r.entered / r.expected) * 100)) : 0;
  const tone =
    r.status === 'DONE' ? 'emerald' : r.status === 'LATE' ? 'red' : 'amber';
  const textTone = { emerald: 'text-emerald-600', red: 'text-red-600', amber: 'text-amber-500' }[tone];
  const barTone = { emerald: 'bg-emerald-500', red: 'bg-red-500', amber: 'bg-amber-500' }[tone];

  function remind() {
    setFeedback(null);
    start(async () => {
      const res = await remindGradeEntryAction(r.source, r.id);
      setFeedback(
        res.ok ? { ok: true, text: t('reminded', { count: res.notified }) } : { ok: false, text: res.error },
      );
    });
  }

  return (
    <tr className="align-middle">
      <td className="px-4 py-3">
        <Link href={r.href} className="font-semibold text-blue-950 hover:underline">
          {r.label}
          {r.source === 'EVALUATION' ? '' : ` — ${r.subjectLabel}`}
        </Link>
        <div className="mt-1">
          <span className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase ${KIND_TONE[r.kind] ?? ''}`}>
            {kindLabel}
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="font-semibold text-slate-900">{r.classLabel}</div>
        <div className="text-xs text-slate-500">{r.subjectLabel}</div>
      </td>
      <td className="px-4 py-3 text-slate-800">{r.teacherLabel}</td>
      <td className="whitespace-nowrap px-4 py-3 text-slate-800">
        {new Date(`${r.date}T00:00:00`).toLocaleDateString(locale, {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })}
      </td>
      <td className="px-4 py-3">
        <span className="whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
          {t('coef', { value: r.coefficient })}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className={`text-xs font-semibold tabular-nums ${textTone}`}>
          {r.entered} / {r.expected}
        </div>
        <div className="mt-1 h-1.5 w-32 rounded-full bg-slate-100">
          <div className={`h-1.5 rounded-full ${barTone}`} style={{ width: `${pct}%` }} />
        </div>
      </td>
      <td className="px-4 py-3">
        {r.status === 'DONE' ? (
          <span
            className={`font-semibold tabular-nums ${
              r.average === null ? 'text-slate-400' : r.average >= 10 ? 'text-emerald-600' : 'text-red-600'
            }`}
          >
            {r.average === null ? '—' : `${num(r.average)} / 20`}
          </span>
        ) : r.status === 'LATE' ? (
          <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600">
            {t('status.LATE')}
          </span>
        ) : (
          <span className="text-slate-500">{t(`status.${r.status}`)}</span>
        )}
      </td>
      <td className="px-4 py-3">
        {r.status === 'DONE' ? (
          <Link
            href={r.href}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-900 px-3 py-2 text-xs font-medium text-white hover:bg-blue-950"
          >
            <IconEye /> {t('action.view')}
          </Link>
        ) : r.status === 'LATE' && canRemind ? (
          <button
            type="button"
            onClick={remind}
            disabled={pending}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-red-400 bg-white px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <IconBell /> {t('action.remind')}
          </button>
        ) : (
          <Link
            href={r.href}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-blue-950 hover:bg-slate-50"
          >
            <IconPencil /> {t('action.enter')}
          </Link>
        )}
        {feedback && (
          <p className={`mt-1 max-w-[12rem] text-[11px] ${feedback.ok ? 'text-emerald-700' : 'text-red-700'}`}>
            {feedback.text}
          </p>
        )}
      </td>
    </tr>
  );
}


const svg = (d: React.ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);
const IconPencil = () => svg(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>);
const IconSearch = () => svg(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>);
const IconEye = () => svg(<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>);
const IconBell = () => svg(<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>);
