'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  createRequiredDocumentAction,
  updateRequiredDocumentAction,
  deleteRequiredDocumentAction,
  setAdmissionQuotaAction,
} from './actions';

const inputCls =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

export type LevelOption = { id: string; label: string };
type DocInitial = {
  code: string;
  labelFr: string;
  labelAr: string;
  levelId: string | null;
  required: boolean;
  order: number;
};

function DocFields({ levels, initial }: { levels: LevelOption[]; initial?: DocInitial }) {
  const t = useTranslations('admin.settings.admissions');
  return (
    <>
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('doc.code')}</label>
        <input
          name="code"
          required
          defaultValue={initial?.code ?? ''}
          placeholder="ACTE_NAISSANCE"
          className={`${inputCls} font-mono uppercase`}
          onInput={(e) => {
            const el = e.currentTarget;
            el.value = el.value.toUpperCase().replace(/[^A-Z0-9_]/g, '');
          }}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('doc.labelFr')}</label>
        <input name="labelFr" required defaultValue={initial?.labelFr ?? ''} className={inputCls} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('doc.labelAr')}</label>
        <input name="labelAr" required dir="rtl" defaultValue={initial?.labelAr ?? ''} className={inputCls} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('doc.level')}</label>
        <select name="levelId" defaultValue={initial?.levelId ?? ''} className={inputCls}>
          <option value="">{t('doc.allLevels')}</option>
          {levels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-slate-700">{t('doc.order')}</label>
          <input type="number" name="order" min={0} max={999} defaultValue={initial?.order ?? 0} className={inputCls} />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="required" defaultChecked={initial?.required ?? true} className="h-4 w-4" />
            {t('doc.required')}
          </label>
        </div>
      </div>
    </>
  );
}

export function DocCreateForm({ levels }: { levels: LevelOption[] }) {
  const t = useTranslations('admin.settings.admissions');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const ref = useRef<HTMLFormElement>(null);
  function onSubmit(fd: FormData) {
    setError('');
    start(async () => {
      const r = await createRequiredDocumentAction(fd);
      if (!r.ok) return setError(r.error);
      ref.current?.reset();
      router.refresh();
    });
  }
  return (
    <form ref={ref} action={onSubmit} className="space-y-3">
      <DocFields levels={levels} />
      {error && <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
      >
        {pending ? t('doc.creating') : t('doc.create')}
      </button>
    </form>
  );
}

export function DocRowActions({
  id,
  initial,
  levels,
}: {
  id: string;
  initial: DocInitial;
  levels: LevelOption[];
}) {
  const t = useTranslations('admin.settings.admissions');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  function onSave(fd: FormData) {
    setError('');
    start(async () => {
      const r = await updateRequiredDocumentAction(id, fd);
      if (!r.ok) return setError(r.error);
      setEditing(false);
      router.refresh();
    });
  }
  function onDelete() {
    if (!confirm(t('doc.confirmDelete'))) return;
    start(async () => {
      const r = await deleteRequiredDocumentAction(id);
      if (!r.ok) return alert(r.error);
      router.refresh();
    });
  }
  if (!editing) {
    return (
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setEditing(true)} className="text-xs text-slate-500 hover:text-brand-700">
          {t('doc.edit')}
        </button>
        <button type="button" onClick={onDelete} disabled={pending} className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50">
          {t('doc.delete')}
        </button>
      </div>
    );
  }
  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-slate-900/40 p-4" onClick={() => setEditing(false)}>
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-slate-900">{t('doc.edit')}</h3>
        <form action={onSave} className="mt-4 space-y-3">
          <DocFields levels={levels} initial={initial} />
          {error && <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div>}
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
            <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
              {t('doc.cancel')}
            </button>
            <button type="submit" disabled={pending} className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50">
              {pending ? t('doc.saving') : t('doc.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function QuotaRow({
  academicYearId,
  levelId,
  levelLabel,
  capacity,
  taken,
}: {
  academicYearId: string;
  levelId: string;
  levelLabel: string;
  capacity: number;
  taken: number;
}) {
  const t = useTranslations('admin.settings.admissions');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [val, setVal] = useState(String(capacity));
  function onSave() {
    start(async () => {
      const fd = new FormData();
      fd.set('academicYearId', academicYearId);
      fd.set('levelId', levelId);
      fd.set('capacity', val);
      const r = await setAdmissionQuotaAction(fd);
      if (!r.ok) return alert(r.error);
      router.refresh();
    });
  }
  return (
    <tr>
      <td className="px-4 py-2 font-medium text-slate-900">{levelLabel}</td>
      <td className="px-4 py-2 text-end text-xs text-slate-500">{taken}</td>
      <td className="px-4 py-2">
        <input
          type="number"
          min={0}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-sm"
        />
      </td>
      <td className="px-4 py-2 text-end">
        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          className="rounded-lg bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? t('quota.saving') : t('quota.save')}
        </button>
      </td>
    </tr>
  );
}
