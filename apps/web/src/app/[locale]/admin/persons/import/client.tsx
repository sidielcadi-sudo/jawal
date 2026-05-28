'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { commitCsvAction, previewCsvAction, type ImportPreviewRow } from './actions';

const SAMPLE_CSV = `type,firstName,lastName,birthDate,gender,email,phone
STUDENT,Karim,Berrada,2012-03-14,M,,
STUDENT,Lina,Tahiri,2012-09-02,F,parent.tahiri@exemple.ma,
STUDENT,Hicham,Fassi,2013-01-21,M,,0612345678
`;

export function ImportClient() {
  const t = useTranslations('admin.persons.import');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [csv, setCsv] = useState('');
  const [step, setStep] = useState<'input' | 'preview' | 'done'>('input');
  const [preview, setPreview] = useState<{ rows: ImportPreviewRow[]; total: number } | null>(null);
  const [error, setError] = useState('');
  const [commitResult, setCommitResult] = useState<{
    created: number;
    total: number;
    errors: { row: number; reason: string }[];
  } | null>(null);

  function onFile(file: File) {
    setError('');
    const reader = new FileReader();
    reader.onload = () => {
      setCsv(String(reader.result ?? ''));
    };
    reader.onerror = () => setError('Lecture du fichier impossible.');
    reader.readAsText(file, 'utf-8');
  }

  function onPreview() {
    setError('');
    startTransition(async () => {
      const r = await previewCsvAction(csv);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setPreview({ rows: r.rows, total: r.total });
      setStep('preview');
    });
  }

  function onCommit() {
    setError('');
    startTransition(async () => {
      const r = await commitCsvAction(csv);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setCommitResult({
        created: r.created,
        total: r.total,
        errors: r.results
          .filter((row): row is Extract<typeof row, { status: 'error' }> => row.status === 'error')
          .map((row) => ({ row: row.row, reason: row.reason })),
      });
      setStep('done');
      router.refresh();
    });
  }

  function reset() {
    setStep('input');
    setCsv('');
    setPreview(null);
    setCommitResult(null);
    setError('');
  }

  if (step === 'done' && commitResult) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4">
          <h3 className="text-base font-semibold text-emerald-900">{t('done.title')}</h3>
          <p className="mt-1 text-sm text-emerald-800">
            {t('done.created', { count: commitResult.created, total: commitResult.total })}
          </p>
          {commitResult.errors.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-amber-800">
                {t('done.errors', { count: commitResult.errors.length })}
              </summary>
              <ul className="mt-2 max-h-40 list-inside space-y-1 overflow-y-auto text-xs text-amber-900">
                {commitResult.errors.map((e) => (
                  <li key={e.row}>
                    Ligne {e.row} : {e.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            {t('done.again')}
          </button>
        </div>
      </div>
    );
  }

  if (step === 'preview' && preview) {
    const validCount = preview.rows.filter((r) => !r.error).length;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <span>
            {t('preview.summary', {
              total: preview.total,
              valid: validCount,
              invalid: preview.total - validCount,
            })}
          </span>
        </div>

        <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-100 text-slate-600">
              <tr>
                <th className="px-2 py-1 text-start">#</th>
                <th className="px-2 py-1 text-start">{t('preview.type')}</th>
                <th className="px-2 py-1 text-start">{t('preview.firstName')}</th>
                <th className="px-2 py-1 text-start">{t('preview.lastName')}</th>
                <th className="px-2 py-1 text-start">{t('preview.email')}</th>
                <th className="px-2 py-1 text-start">{t('preview.status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {preview.rows.slice(0, 50).map((r) => (
                <tr
                  key={r.row}
                  className={r.error ? 'bg-red-50' : ''}
                >
                  <td className="px-2 py-1 text-slate-500">{r.row}</td>
                  <td className="px-2 py-1">{r.parsed?.type ?? r.raw.type}</td>
                  <td className="px-2 py-1">{r.parsed?.firstName ?? r.raw.firstName}</td>
                  <td className="px-2 py-1">{r.parsed?.lastName ?? r.raw.lastName}</td>
                  <td className="px-2 py-1">{r.parsed?.email ?? r.raw.email ?? ''}</td>
                  <td className="px-2 py-1">
                    {r.error ? (
                      <span className="text-red-700" title={r.error}>
                        ✕ {r.error.slice(0, 60)}
                      </span>
                    ) : (
                      <span className="text-emerald-700">✓</span>
                    )}
                  </td>
                </tr>
              ))}
              {preview.rows.length > 50 && (
                <tr>
                  <td colSpan={6} className="px-2 py-2 text-center text-slate-500">
                    … {t('preview.more', { count: preview.rows.length - 50 })}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
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
            disabled={isPending || validCount === 0}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
          >
            {isPending ? t('preview.committing') : t('preview.commit', { count: validCount })}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
        <p className="font-medium">{t('help.title')}</p>
        <p className="mt-1">
          {t('help.format')}
          <br />
          {t('help.columns')}{' '}
          <code className="font-mono text-blue-800">type, firstName, lastName, birthDate, gender, email, phone, cin</code>
          <br />
          {t('help.required')}
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700">{t('input.file')}</label>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
          className="mt-1 w-full text-sm"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700">{t('input.paste')}</label>
        <textarea
          rows={8}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder={SAMPLE_CSV}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <button
          type="button"
          onClick={() => setCsv(SAMPLE_CSV)}
          className="mt-1 text-xs text-slate-500 underline hover:text-brand-700"
        >
          {t('input.loadSample')}
        </button>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onPreview}
          disabled={isPending || csv.trim().length === 0}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
        >
          {isPending ? t('input.previewing') : t('input.preview')}
        </button>
      </div>
    </div>
  );
}
