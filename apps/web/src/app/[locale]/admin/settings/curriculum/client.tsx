'use client';

import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  createCycleAction,
  createLevelAction,
  updateCycleAction,
  deleteCycleAction,
  updateLevelAction,
  deleteLevelAction,
} from './actions';

const inputCls =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

export type CycleOption = { id: string; label: string };

function PeriodKindField({ defaultValue }: { defaultValue?: string }) {
  const t = useTranslations('admin.settings.curriculum.cycles.form');
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700">{t('periodKind')}</label>
      <select name="periodKind" defaultValue={defaultValue ?? 'TRIMESTER'} className={inputCls}>
        <option value="TRIMESTER">{t('periodKindTrimester')}</option>
        <option value="SEMESTER">{t('periodKindSemester')}</option>
      </select>
    </div>
  );
}

function RoomModeField({ defaultValue }: { defaultValue?: string }) {
  const t = useTranslations('admin.settings.curriculum.cycles.form');
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700">{t('roomMode')}</label>
      <select name="roomMode" defaultValue={defaultValue ?? 'HOMEROOM'} className={inputCls}>
        <option value="HOMEROOM">{t('roomModeHomeroom')}</option>
        <option value="POOL">{t('roomModePool')}</option>
      </select>
      <p className="mt-1 text-[11px] text-slate-400">{t('roomModeHint')}</p>
    </div>
  );
}

export function CycleCreateForm() {
  const t = useTranslations('admin.settings.curriculum.cycles.form');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const ref = useRef<HTMLFormElement>(null);

  function onSubmit(formData: FormData) {
    setError('');
    startTransition(async () => {
      const r = await createCycleAction(formData);
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
        <input type="text" name="code" required placeholder="primaire" className={inputCls} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('label')}</label>
        <input type="text" name="label" required placeholder="Primaire" className={inputCls} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('order')}</label>
        <input type="number" name="order" defaultValue={0} min={0} max={99} className={inputCls} />
      </div>
      <PeriodKindField />
      <RoomModeField />
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

export function CycleRowActions({
  id,
  initial,
}: {
  id: string;
  initial: { code: string; label: string; order: number; periodKind: string; roomMode: string };
}) {
  const t = useTranslations('admin.settings.curriculum');
  const tForm = useTranslations('admin.settings.curriculum.cycles.form');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');

  function onSave(formData: FormData) {
    setError('');
    startTransition(async () => {
      const r = await updateCycleAction(id, formData);
      if (!r.ok) return setError(r.error);
      setEditing(false);
      router.refresh();
    });
  }
  function onDelete() {
    if (!confirm(t('confirmDelete'))) return;
    startTransition(async () => {
      const r = await deleteCycleAction(id);
      if (!r.ok) return alert(r.error);
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setEditing(true)} className="text-xs text-slate-500 hover:text-brand-700">
          {t('actions.edit')}
        </button>
        <button type="button" onClick={onDelete} disabled={isPending} className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50">
          {t('actions.delete')}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-slate-900/40 p-4" onClick={() => setEditing(false)}>
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-slate-900">{t('actions.edit')}</h3>
        <form action={onSave} className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-700">{tForm('code')}</label>
            <input type="text" name="code" required defaultValue={initial.code} className={`${inputCls} font-mono`} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">{tForm('label')}</label>
            <input type="text" name="label" required defaultValue={initial.label} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">{tForm('order')}</label>
            <input type="number" name="order" defaultValue={initial.order} min={0} max={99} className={inputCls} />
          </div>
          <PeriodKindField defaultValue={initial.periodKind} />
          <RoomModeField defaultValue={initial.roomMode} />
          {error && <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div>}
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
            <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
              {tForm('cancel')}
            </button>
            <button type="submit" disabled={isPending} className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50">
              {isPending ? tForm('saving') : tForm('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function LevelCreateForm({ cycles }: { cycles: { id: string; label: string }[] }) {
  const t = useTranslations('admin.settings.curriculum.levels.form');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const ref = useRef<HTMLFormElement>(null);

  function onSubmit(formData: FormData) {
    setError('');
    startTransition(async () => {
      const r = await createLevelAction(formData);
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
        <label className="block text-xs font-medium text-slate-700">{t('cycle')}</label>
        <select name="cycleId" required defaultValue="" className={inputCls}>
          <option value="" disabled>
            —
          </option>
          {cycles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('code')}</label>
        <input type="text" name="code" required placeholder="6ap" className={inputCls} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('label')}</label>
        <input
          type="text"
          name="label"
          required
          placeholder="6ème année primaire"
          className={inputCls}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('order')}</label>
        <input type="number" name="order" defaultValue={0} min={0} max={99} className={inputCls} />
      </div>
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div>
      )}
      <button
        type="submit"
        disabled={isPending || cycles.length === 0}
        className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
      >
        {isPending ? t('creating') : t('create')}
      </button>
    </form>
  );
}

export function LevelRowActions({
  id,
  initial,
  cycles,
}: {
  id: string;
  initial: { cycleId: string; code: string; label: string; order: number };
  cycles: CycleOption[];
}) {
  const t = useTranslations('admin.settings.curriculum');
  const tForm = useTranslations('admin.settings.curriculum.levels.form');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');

  function onSave(formData: FormData) {
    setError('');
    startTransition(async () => {
      const r = await updateLevelAction(id, formData);
      if (!r.ok) return setError(r.error);
      setEditing(false);
      router.refresh();
    });
  }
  function onDelete() {
    if (!confirm(t('confirmDelete'))) return;
    startTransition(async () => {
      const r = await deleteLevelAction(id);
      if (!r.ok) return alert(r.error);
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setEditing(true)} className="text-xs text-slate-500 hover:text-brand-700">
          {t('actions.edit')}
        </button>
        <button type="button" onClick={onDelete} disabled={isPending} className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50">
          {t('actions.delete')}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-slate-900/40 p-4" onClick={() => setEditing(false)}>
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-slate-900">{t('actions.edit')}</h3>
        <form action={onSave} className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-700">{tForm('cycle')}</label>
            <select name="cycleId" required defaultValue={initial.cycleId} className={inputCls}>
              {cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">{tForm('code')}</label>
            <input type="text" name="code" required defaultValue={initial.code} className={`${inputCls} font-mono`} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">{tForm('label')}</label>
            <input type="text" name="label" required defaultValue={initial.label} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">{tForm('order')}</label>
            <input type="number" name="order" defaultValue={initial.order} min={0} max={99} className={inputCls} />
          </div>
          {error && <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div>}
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
            <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
              {tForm('cancel')}
            </button>
            <button type="submit" disabled={isPending} className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50">
              {isPending ? tForm('saving') : tForm('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
