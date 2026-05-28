'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createEvaluationAction, deleteEvaluationAction } from './actions';

const inputCls =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

export function EvaluationCreateForm({
  classId,
  subjects,
  periods,
  defaultSubjectId,
  defaultPeriodId,
}: {
  classId: string;
  subjects: { id: string; label: string; scale: number }[];
  periods: { id: string; label: string }[];
  defaultSubjectId?: string;
  defaultPeriodId?: string;
}) {
  const t = useTranslations('admin.grades.form');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const ref = useRef<HTMLFormElement>(null);
  const [scaleHint, setScaleHint] = useState(subjects[0]?.scale ?? 20);

  function onSubjectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const s = subjects.find((x) => x.id === e.target.value);
    if (s) setScaleHint(s.scale);
  }

  function onSubmit(formData: FormData) {
    setError('');
    formData.set('classId', classId);
    startTransition(async () => {
      const r = await createEvaluationAction(formData);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const id = (r.data as { id: string }).id;
      router.push(`/${window.location.pathname.split('/').slice(1, 3).join('/')}/admin/classes/${classId}/grades/${id}`);
    });
  }

  return (
    <form ref={ref} action={onSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('label')}</label>
        <input
          type="text"
          name="label"
          required
          placeholder="Contrôle n°1"
          className={inputCls}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('subject')}</label>
        <select
          name="subjectId"
          required
          defaultValue={defaultSubjectId ?? ''}
          onChange={onSubjectChange}
          className={inputCls}
        >
          <option value="" disabled>
            —
          </option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label} (/{s.scale})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('period')}</label>
        <select name="periodId" required defaultValue={defaultPeriodId ?? ''} className={inputCls}>
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
            defaultValue={scaleHint}
            min={1}
            step="0.5"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700">{t('weight')}</label>
          <input type="number" name="weight" defaultValue={1} min={0.1} step="0.5" className={inputCls} />
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

export function EvaluationRowActions({
  evaluationId,
  classId,
  locale,
}: {
  evaluationId: string;
  classId: string;
  locale: string;
}) {
  const t = useTranslations('admin.grades');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onDelete() {
    if (!confirm(t('confirmDelete'))) return;
    startTransition(async () => {
      const r = await deleteEvaluationAction(evaluationId, classId);
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="flex justify-end gap-2">
      <a
        href={`/${locale}/admin/classes/${classId}/grades/${evaluationId}`}
        className="text-xs text-slate-500 hover:text-brand-700"
      >
        {t('actions.openSheet')}
      </a>
      <button
        type="button"
        onClick={onDelete}
        disabled={isPending}
        className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
      >
        {t('actions.delete')}
      </button>
    </div>
  );
}
