'use client';

import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createCycleAction, createLevelAction } from './actions';

const inputCls =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

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
