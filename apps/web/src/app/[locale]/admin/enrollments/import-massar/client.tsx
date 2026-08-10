'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { commitMassarAction, previewMassarAction } from './actions';
import type { MassarImportStats, MassarPreview, MassarRowStatus } from '@/lib/massar-import';

type YearOpt = { id: string; label: string; active: boolean };

const STATUS_STYLE: Record<MassarRowStatus, string> = {
  create: 'text-emerald-700',
  update: 'text-sky-700',
  skipped: 'text-slate-400',
  error: 'text-red-700',
};

export function ImportMassarClient({
  years,
  defaultYearId,
  tenantMassarCode,
}: {
  years: YearOpt[];
  defaultYearId: string;
  tenantMassarCode: string | null;
}) {
  const t = useTranslations('admin.enrollments.importMassar');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [csv, setCsv] = useState('');
  const [yearId, setYearId] = useState(defaultYearId);
  const [step, setStep] = useState<'input' | 'preview' | 'done'>('input');
  const [preview, setPreview] = useState<MassarPreview | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState<MassarImportStats | null>(null);

  function onFile(file: File) {
    setError('');
    const reader = new FileReader();
    // MASSAR exporte en UTF-8 ; l'arabe serait illisible dans un autre encodage.
    reader.onload = () => setCsv(String(reader.result ?? ''));
    reader.onerror = () => setError(t('readError'));
    reader.readAsText(file, 'utf-8');
  }

  function onPreview() {
    setError('');
    startTransition(async () => {
      const r = await previewMassarAction(csv, yearId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setPreview(r.preview);
      setStep('preview');
    });
  }

  function onCommit() {
    setError('');
    startTransition(async () => {
      const r = await commitMassarAction(csv, yearId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setResult(r.stats);
      setStep('done');
      router.refresh();
    });
  }

  function reset() {
    setStep('input');
    setCsv('');
    setPreview(null);
    setResult(null);
    setError('');
  }

  // ── Étape 3 : rapport ────────────────────────────────────────────────────
  if (step === 'done' && result) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5">
          <h3 className="text-base font-semibold text-emerald-900">{t('done.title')}</h3>
          <ul className="mt-2 space-y-1 text-sm text-emerald-900">
            <li>{t('done.students', { count: result.students })}</li>
            <li>{t('done.enrollments', { count: result.enrollments })}</li>
            <li>{t('done.classes', { count: result.classes })}</li>
            <li>{t('done.parents', { count: result.parents })}</li>
            {result.skipped > 0 && (
              <li className="text-emerald-800/70">{t('done.skipped', { count: result.skipped })}</li>
            )}
            {result.errors > 0 && (
              <li className="text-amber-800">{t('done.errors', { count: result.errors })}</li>
            )}
          </ul>
          <p className="mt-3 text-xs text-emerald-800/80">{t('done.draftHint')}</p>
        </div>
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          {t('done.again')}
        </button>
      </div>
    );
  }

  // ── Étape 2 : prévisualisation ───────────────────────────────────────────
  if (step === 'preview' && preview) {
    const importable = preview.counts.create + preview.counts.update;
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Stat label={t('counter.create')} value={preview.counts.create} tone="emerald" />
          <Stat label={t('counter.update')} value={preview.counts.update} tone="sky" />
          <Stat label={t('counter.skipped')} value={preview.counts.skipped} tone="slate" />
          <Stat label={t('counter.error')} value={preview.counts.error} tone="red" />
        </div>

        <p className="text-sm text-slate-600">
          {t('preview.target', { year: preview.yearLabel })}
          {preview.tenantMassarCode && ` · ${t('preview.filter', { code: preview.tenantMassarCode })}`}
        </p>

        {preview.classesToCreate.length > 0 && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
            <span className="font-medium">
              {t('preview.classesToCreate', { count: preview.classesToCreate.length })}
            </span>{' '}
            {preview.classesToCreate.join(', ')}
          </div>
        )}

        <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-100 text-slate-600">
              <tr>
                <th className="px-2 py-1 text-start">#</th>
                <th className="px-2 py-1 text-start">{t('col.massarId')}</th>
                <th className="px-2 py-1 text-start">{t('col.name')}</th>
                <th className="px-2 py-1 text-start">{t('col.nameAr')}</th>
                <th className="px-2 py-1 text-start">{t('col.level')}</th>
                <th className="px-2 py-1 text-start">{t('col.class')}</th>
                <th className="px-2 py-1 text-start">{t('col.status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {preview.rows.map((r) => (
                <tr key={r.row} className={r.status === 'error' ? 'bg-red-50' : ''}>
                  <td className="px-2 py-1 text-slate-400">{r.row}</td>
                  <td className="px-2 py-1 font-mono">{r.massarId}</td>
                  <td className="px-2 py-1">{r.name}</td>
                  <td className="px-2 py-1" dir="rtl">
                    {r.nameAr}
                  </td>
                  <td className="px-2 py-1 text-slate-600">{r.levelLabel || '—'}</td>
                  <td className="px-2 py-1">
                    {r.className}
                    {r.status !== 'error' && r.status !== 'skipped' && !r.classExists && (
                      <span className="ms-1 text-[10px] text-blue-700">{t('preview.newClass')}</span>
                    )}
                  </td>
                  <td className={`px-2 py-1 ${STATUS_STYLE[r.status]}`}>
                    {r.status === 'error' ? (
                      <span title={r.error}>✕ {r.error}</span>
                    ) : r.status === 'skipped' ? (
                      <span title={t('preview.skippedHint', { code: r.schoolCode })}>
                        ⊘ {r.schoolCode}
                      </span>
                    ) : (
                      `✓ ${t(`status.${r.status}`)}`
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={() => setStep('input')}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            {t('preview.back')}
          </button>
          <button
            type="button"
            onClick={onCommit}
            disabled={isPending || importable === 0}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
          >
            {isPending ? t('preview.committing') : t('preview.commit', { count: importable })}
          </button>
        </div>
      </div>
    );
  }

  // ── Étape 1 : saisie ─────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
        <p className="font-medium">{t('help.title')}</p>
        <p className="mt-1">{t('help.columns')}</p>
        <code className="mt-1 block break-all font-mono text-[11px] text-blue-800">
          StudentID, LastNameFr, FirstNameFr, LastNameAr, FirstNameAr, Gender, BirthDate, Level,
          ClassNameFr, ClassNameAr, CurrentSchoolCode, FatherNameFr, MotherNameFr, Phone1, Phone2,
          AddressFr, CityFr, AddressAr, CityAr
        </code>
        <ul className="mt-2 list-disc space-y-0.5 ps-4">
          <li>{t('help.massarId')}</li>
          <li>{t('help.level')}</li>
          <li>{t('help.class')}</li>
          <li>{t('help.draft')}</li>
          <li>
            {tenantMassarCode
              ? t('help.schoolCode', { code: tenantMassarCode })
              : t('help.noSchoolCode')}
          </li>
        </ul>
      </div>

      <label className="block max-w-xs">
        <span className="block text-xs font-medium text-slate-700">{t('input.year')}</span>
        <select
          value={yearId}
          onChange={(e) => setYearId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          {years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.label}
              {y.active ? ' ★' : ''}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="block text-xs font-medium text-slate-700">{t('input.file')}</span>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
          className="mt-1 w-full text-sm"
        />
      </label>

      <label className="block">
        <span className="block text-xs font-medium text-slate-700">{t('input.paste')}</span>
        <textarea
          rows={8}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </label>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onPreview}
          disabled={isPending || csv.trim().length === 0 || !yearId}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
        >
          {isPending ? t('input.previewing') : t('input.preview')}
        </button>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'emerald' | 'sky' | 'slate' | 'red';
}) {
  const map = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    sky: 'border-sky-200 bg-sky-50 text-sky-800',
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    red: 'border-red-200 bg-red-50 text-red-800',
  } as const;
  return (
    <div className={`rounded-2xl border p-4 text-center ${map[tone]}`}>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs">{label}</div>
    </div>
  );
}
