'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { personDisplayName } from '@/lib/localized-name';

type Row = {
  studentId: string;
  firstName: string;
  lastName: string;
  firstNameAr: string | null;
  lastNameAr: string | null;
  value: number | null;
  comment: string | null;
};

type EditRow = {
  studentId: string;
  firstName: string;
  lastName: string;
  firstNameAr: string | null;
  lastNameAr: string | null;
  text: string;
  comment: string | null;
};

/** '12,5' ou '12.5' → 12.5 ; vide/NaN → null. */
function parseMark(text: string): number | null {
  const t = text.replace(',', '.').trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
}

export function GradeMatrix({
  evaluationId,
  maxValue,
  rows: initialRows,
  backUrl,
  onSave,
}: {
  evaluationId: string;
  maxValue: number;
  rows: Row[];
  backUrl: string;
  /** Action serveur de sauvegarde (admin ou enseignant selon le contexte). */
  onSave: (fd: FormData) => Promise<{ ok: boolean; error?: string }>;
}) {
  const t = useTranslations('admin.grades.sheet');
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rows, setRows] = useState<EditRow[]>(() =>
    initialRows.map((r) => ({
      studentId: r.studentId,
      firstName: r.firstName,
      lastName: r.lastName,
      firstNameAr: r.firstNameAr,
      lastNameAr: r.lastNameAr,
      text: r.value === null ? '' : String(r.value),
      comment: r.comment,
    })),
  );
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  function setValue(studentId: string, raw: string) {
    // On conserve le texte brut tel quel (autorise « 12,5 » pendant la frappe).
    setRows((rs) => rs.map((r) => (r.studentId === studentId ? { ...r, text: raw } : r)));
  }

  const stats = useMemo(() => {
    const valid = rows
      .map((r) => parseMark(r.text))
      .filter((v): v is number => v !== null);
    if (valid.length === 0) return null;
    const avg = valid.reduce((s, x) => s + x, 0) / valid.length;
    const min = Math.min(...valid);
    const max = Math.max(...valid);
    return { avg, min, max, count: valid.length, total: rows.length };
  }, [rows]);

  function save() {
    setError('');
    const fd = new FormData();
    fd.set(
      'payload',
      JSON.stringify({
        evaluationId,
        grades: rows.map((r) => ({
          studentId: r.studentId,
          value: parseMark(r.text),
          comment: r.comment,
        })),
      }),
    );
    startTransition(async () => {
      const result = await onSave(fd);
      if (!result.ok) {
        setError(result.error ?? 'Erreur');
        return;
      }
      setSavedAt(new Date());
      router.refresh();
    });
  }

  // Validation visuelle : note > maxValue
  function isOver(text: string) {
    const v = parseMark(text);
    return v !== null && v > maxValue;
  }

  return (
    <div className="space-y-4">
      {stats && (
        <div className="grid grid-cols-4 gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-center text-xs">
          <Pill label={t('stats.avg')} value={stats.avg.toFixed(2)} color="brand" />
          <Pill label={t('stats.min')} value={stats.min.toFixed(2)} color="red" />
          <Pill label={t('stats.max')} value={stats.max.toFixed(2)} color="emerald" />
          <Pill label={t('stats.filled')} value={`${stats.count}/${stats.total}`} color="slate" />
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
            <tr>
              <th className="px-4 py-3 text-start">{t('table.student')}</th>
              <th className="w-32 px-4 py-3 text-end">{t('table.value')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.studentId}>
                <td className="px-4 py-2 font-medium text-slate-900">
                  {personDisplayName(locale, r)}
                </td>
                <td className="px-4 py-2 text-end">
                  <div className="flex items-center justify-end gap-1">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={r.text}
                      onChange={(e) => setValue(r.studentId, e.target.value)}
                      placeholder="—"
                      className={`w-20 rounded border px-2 py-1 text-end text-sm tabular-nums shadow-sm focus:outline-none focus:ring-1 ${
                        isOver(r.text)
                          ? 'border-red-400 bg-red-50 text-red-900 focus:border-red-500 focus:ring-red-500'
                          : 'border-slate-300 focus:border-brand-500 focus:ring-brand-500'
                      }`}
                    />
                    <span className="text-xs text-slate-400">/{maxValue}</span>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={2} className="px-4 py-10 text-center text-slate-500">
                  {t('noStudents')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {savedAt && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          {t('savedAt', { date: savedAt.toLocaleTimeString() })}
        </div>
      )}

      <div className="sticky bottom-0 -mx-6 flex flex-wrap gap-2 border-t border-slate-200 bg-white p-3 sm:relative sm:bottom-auto sm:mx-0 sm:rounded-2xl sm:border sm:p-4">
        <a
          href={backUrl}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          {t('back')}
        </a>
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="ms-auto rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
        >
          {isPending ? t('saving') : t('save')}
        </button>
      </div>
    </div>
  );
}

function Pill({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: 'brand' | 'emerald' | 'red' | 'slate';
}) {
  const styles = {
    brand: 'text-brand-700',
    emerald: 'text-emerald-700',
    red: 'text-red-700',
    slate: 'text-slate-700',
  }[color];
  return (
    <div>
      <div className={`text-xl font-semibold tabular-nums ${styles}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
