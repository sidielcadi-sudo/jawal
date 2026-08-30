'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createSubjectAction, deleteSubjectAction, updateSubjectAction } from './actions';

const inputCls =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

type SubjectData = {
  code: string;
  label: string;
  labelAr?: string | null;
  scale: number;
  coefficient: number;
  order: number;
};

export function SubjectCreateForm() {
  const t = useTranslations('admin.settings.subjects.form');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const ref = useRef<HTMLFormElement>(null);

  function onSubmit(formData: FormData) {
    setError('');
    startTransition(async () => {
      const r = await createSubjectAction(formData);
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
        <label className="block text-xs font-medium text-slate-700">{t('code')}</label>
        <input type="text" name="code" required placeholder="math" className={inputCls} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('label')}</label>
        <input type="text" name="label" required placeholder="Mathématiques" className={inputCls} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('labelAr')}</label>
        <input type="text" name="labelAr" dir="rtl" placeholder="الرياضيات" className={inputCls} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-xs font-medium text-slate-700">{t('scale')}</label>
          <input
            type="number"
            name="scale"
            defaultValue={20}
            min={1}
            max={1000}
            step="any"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700">{t('coefficient')}</label>
          <input
            type="number"
            name="coefficient"
            defaultValue={1}
            min={0.1}
            max={20}
            step="any"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700">{t('order')}</label>
          <input type="number" name="order" defaultValue={0} min={0} max={99} className={inputCls} />
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

export function SubjectRowActions({ id, initial }: { id: string; initial: SubjectData }) {
  const t = useTranslations('admin.settings.subjects');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');

  function onSave(formData: FormData) {
    setError('');
    startTransition(async () => {
      const r = await updateSubjectAction(id, formData);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function onDelete() {
    if (!confirm(t('confirmDelete'))) return;
    startTransition(async () => {
      const r = await deleteSubjectAction(id);
      if (!r.ok) {
        setError(r.error);
        alert(r.error);
        return;
      }
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-slate-500 hover:text-brand-700"
        >
          {t('actions.edit')}
        </button>
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

  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-slate-900/40 p-4" onClick={() => setEditing(false)}>
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-slate-900">{t('actions.edit')}</h3>
        <form action={onSave} className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-700">{t('form.code')}</label>
            <input type="text" name="code" required defaultValue={initial.code} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">{t('form.label')}</label>
            <input type="text" name="label" required defaultValue={initial.label} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">{t('form.labelAr')}</label>
            <input
              type="text"
              name="labelAr"
              dir="rtl"
              defaultValue={initial.labelAr ?? ''}
              className={inputCls}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-700">{t('form.scale')}</label>
              <input
                type="number"
                name="scale"
                defaultValue={initial.scale}
                min={1}
                step="any"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">{t('form.coefficient')}</label>
              <input
                type="number"
                name="coefficient"
                defaultValue={initial.coefficient}
                min={0.1}
                step="any"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">{t('form.order')}</label>
              <input
                type="number"
                name="order"
                defaultValue={initial.order}
                min={0}
                max={99}
                className={inputCls}
              />
            </div>
          </div>
          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div>
          )}
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              {t('form.cancel')}
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
            >
              {isPending ? t('form.saving') : t('form.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
