'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createTeacherEvaluationAction, deleteTeacherEvaluationAction } from './actions';

const inputCls =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

export function TeacherEvaluationForm({
  classId,
  subjectId,
  subjectLabel,
  periods,
  defaultMax,
  basePath,
}: {
  classId: string;
  subjectId: string;
  subjectLabel: string;
  periods: { id: string; label: string }[];
  defaultMax: number;
  basePath: string;
}) {
  const t = useTranslations('enseignant.grades.form');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

  function onSubmit(formData: FormData) {
    setError('');
    formData.set('classId', classId);
    formData.set('subjectId', subjectId);
    startTransition(async () => {
      const r = await createTeacherEvaluationAction(formData);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(`${basePath}/${(r.data as { id: string }).id}`);
    });
  }

  return (
    <form action={onSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('subject')}</label>
        <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {subjectLabel}
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('label')}</label>
        <input type="text" name="label" required placeholder="Contrôle n°1" className={inputCls} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('period')}</label>
        <select name="periodId" required defaultValue="" className={inputCls}>
          <option value="" disabled>
            —
          </option>
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-xs font-medium text-slate-700">{t('date')}</label>
          <input
            type="date"
            name="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700">{t('maxValue')}</label>
          <input
            type="number"
            name="maxValue"
            defaultValue={defaultMax}
            min={1}
            step="any"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700">{t('weight')}</label>
          <input type="number" name="weight" defaultValue={1} min={0.1} step="any" className={inputCls} />
        </div>
      </div>
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
      >
        {isPending ? t('creating') : t('create')}
      </button>
    </form>
  );
}

export function TeacherEvalRowActions({
  evaluationId,
  classId,
  subjectId,
  sheetHref,
}: {
  evaluationId: string;
  classId: string;
  subjectId: string;
  sheetHref: string;
}) {
  const t = useTranslations('enseignant.grades');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onDelete() {
    if (!confirm(t('confirmDelete'))) return;
    startTransition(async () => {
      const r = await deleteTeacherEvaluationAction(evaluationId, classId, subjectId);
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="flex justify-end gap-2">
      <a href={sheetHref} className="text-xs text-slate-500 hover:text-brand-700">
        {t('openSheet')}
      </a>
      <button
        type="button"
        onClick={onDelete}
        disabled={isPending}
        className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
      >
        {t('delete')}
      </button>
    </div>
  );
}
