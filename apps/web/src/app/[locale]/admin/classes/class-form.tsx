'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createClassAction, updateClassAction } from './actions';

type ClassFormInitial = {
  id?: string;
  name?: string;
  capacity?: number;
  academicYearId?: string;
  levelId?: string;
  mainTeacherId?: string | null;
};

type Option = { id: string; label: string; isDefault?: boolean };

export function ClassForm({
  mode,
  initial,
  years,
  levels,
  teachers,
  locale,
}: {
  mode: 'create' | 'edit';
  initial?: ClassFormInitial;
  years: Option[];
  levels: Option[];
  teachers: Option[];
  locale: string;
}) {
  const t = useTranslations('admin.classes.form');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function onSubmit(formData: FormData) {
    setError('');
    setFieldErrors({});
    startTransition(async () => {
      const result =
        mode === 'create'
          ? await createClassAction(formData)
          : await updateClassAction(initial!.id!, formData);

      if (!result.ok) {
        setError(result.error);
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
        return;
      }

      const id = mode === 'create' ? (result.data as { id: string }).id : initial!.id!;
      router.push(`/${locale}/admin/classes/${id}`);
      router.refresh();
    });
  }

  const inputCls =
    'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

  const defaultYearId =
    initial?.academicYearId ?? years.find((y) => y.isDefault)?.id ?? years[0]?.id;

  return (
    <form action={onSubmit} className="space-y-4">
      <Field label={t('name')} error={fieldErrors.name}>
        <input
          type="text"
          name="name"
          required
          minLength={1}
          maxLength={60}
          defaultValue={initial?.name ?? ''}
          placeholder="1AC-A"
          className={inputCls}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('year')} error={fieldErrors.academicYearId}>
          <select
            name="academicYearId"
            required
            defaultValue={defaultYearId}
            disabled={mode === 'edit'}
            className={`${inputCls} disabled:bg-slate-50`}
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('level')} error={fieldErrors.levelId}>
          <select
            name="levelId"
            required
            defaultValue={initial?.levelId ?? ''}
            disabled={mode === 'edit'}
            className={`${inputCls} disabled:bg-slate-50`}
          >
            <option value="" disabled>
              {t('selectLevel')}
            </option>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('capacity')} error={fieldErrors.capacity}>
          <input
            type="number"
            name="capacity"
            min={1}
            max={200}
            defaultValue={initial?.capacity ?? 30}
            className={inputCls}
          />
        </Field>
        <Field label={t('mainTeacher')}>
          <select
            name="mainTeacherId"
            defaultValue={initial?.mainTeacherId ?? ''}
            className={inputCls}
          >
            <option value="">{t('noTeacher')}</option>
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          {t('actions.cancel')}
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
        >
          {isPending ? t('actions.saving') : t('actions.save')}
        </button>
      </div>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
