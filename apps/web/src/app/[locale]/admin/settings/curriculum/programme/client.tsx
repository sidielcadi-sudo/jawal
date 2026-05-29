'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  upsertCurriculumSubjectAction,
  deleteCurriculumSubjectAction,
} from './actions';

const inputCls =
  'w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm text-end shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

export function ProgrammeMatrix({
  id,
  levelId,
  subjectId,
  subjectLabel,
  weeklyHours,
  coefficient,
  order,
}: {
  id: string;
  levelId: string;
  subjectId: string;
  subjectLabel: string;
  weeklyHours: number;
  coefficient: number;
  order: number;
}) {
  const t = useTranslations('admin.settings.programme');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [h, setH] = useState(weeklyHours);
  const [c, setC] = useState(coefficient);
  const [o, setO] = useState(order);
  const [dirty, setDirty] = useState(false);

  function onSave() {
    if (!dirty) return;
    const fd = new FormData();
    fd.set('levelId', levelId);
    fd.set('subjectId', subjectId);
    fd.set('weeklyHours', String(h));
    fd.set('coefficient', String(c));
    fd.set('order', String(o));
    startTransition(async () => {
      await upsertCurriculumSubjectAction(fd);
      setDirty(false);
      router.refresh();
    });
  }

  function onDelete() {
    if (!confirm(t('confirmDelete'))) return;
    startTransition(async () => {
      await deleteCurriculumSubjectAction(id);
      router.refresh();
    });
  }

  return (
    <tr>
      <td className="px-4 py-3 font-medium text-slate-900">{subjectLabel}</td>
      <td className="px-4 py-3 text-end">
        <input
          type="number"
          step="any"
          min={0}
          max={60}
          value={h}
          onChange={(e) => {
            setH(Number(e.target.value));
            setDirty(true);
          }}
          className={inputCls}
        />
      </td>
      <td className="px-4 py-3 text-end">
        <input
          type="number"
          step="any"
          min={0.1}
          max={20}
          value={c}
          onChange={(e) => {
            setC(Number(e.target.value));
            setDirty(true);
          }}
          className={inputCls}
        />
      </td>
      <td className="px-4 py-3 text-end">
        <input
          type="number"
          min={0}
          max={99}
          value={o}
          onChange={(e) => {
            setO(Number(e.target.value));
            setDirty(true);
          }}
          className={`${inputCls} w-16`}
        />
      </td>
      <td className="px-4 py-3 text-end">
        {dirty && (
          <button
            type="button"
            onClick={onSave}
            disabled={isPending}
            className="me-2 rounded-lg bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {isPending ? '…' : t('actions.save')}
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          disabled={isPending}
          className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
        >
          {t('actions.delete')}
        </button>
      </td>
    </tr>
  );
}

export function ProgrammeAddRow({
  levelId,
  subjects,
}: {
  levelId: string;
  subjects: { id: string; label: string; defaultCoefficient: number }[];
}) {
  const t = useTranslations('admin.settings.programme.form');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const ref = useRef<HTMLFormElement>(null);
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? '');
  const defaultCoef =
    subjects.find((s) => s.id === subjectId)?.defaultCoefficient ?? 1;

  function onSubmit(formData: FormData) {
    setError('');
    formData.set('levelId', levelId);
    startTransition(async () => {
      const r = await upsertCurriculumSubjectAction(formData);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      ref.current?.reset();
      router.refresh();
    });
  }

  return (
    <form ref={ref} action={onSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('subject')}</label>
        <select
          name="subjectId"
          required
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-slate-700">{t('weeklyHours')}</label>
          <input
            type="number"
            name="weeklyHours"
            required
            step="any"
            min={0}
            max={60}
            defaultValue={4}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700">{t('coefficient')}</label>
          <input
            key={subjectId}
            type="number"
            name="coefficient"
            required
            step="any"
            min={0.1}
            max={20}
            defaultValue={defaultCoef}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm"
          />
        </div>
      </div>
      <input type="hidden" name="order" value="0" />
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
      >
        {isPending ? t('creating') : t('add')}
      </button>
    </form>
  );
}
