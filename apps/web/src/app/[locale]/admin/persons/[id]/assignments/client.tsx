'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createAssignmentAction, deleteAssignmentAction } from './actions';

const inputCls =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

export function AssignmentCreateForm({
  teacherId,
  subjects,
  classes,
  years,
}: {
  teacherId: string;
  subjects: { id: string; label: string }[];
  classes: { id: string; name: string; academicYearId: string; academicYearLabel: string }[];
  years: { id: string; label: string; active: boolean }[];
}) {
  const t = useTranslations('admin.persons.assignments.form');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const ref = useRef<HTMLFormElement>(null);

  const activeYear = years.find((y) => y.active) ?? years[0];
  const [yearId, setYearId] = useState(activeYear?.id ?? '');

  const filteredClasses = useMemo(
    () => classes.filter((c) => c.academicYearId === yearId),
    [classes, yearId],
  );

  function onSubmit(formData: FormData) {
    setError('');
    startTransition(async () => {
      const r = await createAssignmentAction(teacherId, formData);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      ref.current?.reset();
      setYearId(activeYear?.id ?? '');
      router.refresh();
    });
  }

  return (
    <form ref={ref} action={onSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('year')}</label>
        <select
          name="academicYearId"
          required
          value={yearId}
          onChange={(e) => setYearId(e.target.value)}
          className={inputCls}
        >
          {years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.label} {y.active ? '·★' : ''}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('subject')}</label>
        <select name="subjectId" required defaultValue="" className={inputCls}>
          <option value="" disabled>
            — {t('selectSubject')} —
          </option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('class')}</label>
        <select name="classId" required defaultValue="" className={inputCls}>
          <option value="" disabled>
            — {t('selectClass')} —
          </option>
          {filteredClasses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('hoursPerWeek')}</label>
        <input
          type="number"
          name="hoursPerWeek"
          step="any"
          min={0}
          max={40}
          placeholder="4"
          className={inputCls}
        />
      </div>
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div>
      )}
      <button
        type="submit"
        disabled={isPending || subjects.length === 0 || filteredClasses.length === 0}
        className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
      >
        {isPending ? t('creating') : t('create')}
      </button>
      {(subjects.length === 0 || filteredClasses.length === 0) && (
        <p className="text-xs text-amber-700">{t('emptyHint')}</p>
      )}
    </form>
  );
}

export function AssignmentRowActions({ teacherId, assignmentId }: { teacherId: string; assignmentId: string }) {
  const t = useTranslations('admin.persons.assignments');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onDelete() {
    if (!confirm(t('confirmDelete'))) return;
    startTransition(async () => {
      await deleteAssignmentAction(teacherId, assignmentId);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={isPending}
      className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
    >
      {t('actions.delete')}
    </button>
  );
}
