'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  createFeeScheduleAction,
  deleteFeeScheduleAction,
  updateFeeScheduleAction,
  createDiscountRuleAction,
  updateDiscountRuleAction,
  deleteDiscountRuleAction,
} from './actions';

const inputCls =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

export function FeeCreateForm({
  years,
  levels,
  currency,
}: {
  years: { id: string; label: string; active: boolean }[];
  levels: { id: string; label: string }[];
  currency: string;
}) {
  const t = useTranslations('admin.settings.fees.form');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const ref = useRef<HTMLFormElement>(null);

  function onSubmit(formData: FormData) {
    setError('');
    startTransition(async () => {
      const r = await createFeeScheduleAction(formData);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      ref.current?.reset();
      router.refresh();
    });
  }

  const defaultYearId = years.find((y) => y.active)?.id ?? years[0]?.id;

  return (
    <form ref={ref} action={onSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('year')}</label>
        <select name="academicYearId" required defaultValue={defaultYearId} className={inputCls}>
          {years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.label}
              {y.active ? ' (actif)' : ''}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('level')}</label>
        <select name="levelId" required defaultValue="" className={inputCls}>
          <option value="" disabled>
            —
          </option>
          {levels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('label')}</label>
        <input type="text" name="label" required placeholder="Frais annuels" className={inputCls} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-slate-700">
            {t('totalAmount')} ({currency})
          </label>
          <input
            type="number"
            name="totalAmount"
            required
            min={1}
            step="0.01"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700">{t('installmentCount')}</label>
          <input
            type="number"
            name="installmentCount"
            defaultValue={9}
            min={1}
            max={24}
            className={inputCls}
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('firstDueMonth')}</label>
        <select name="firstDueMonth" defaultValue={9} className={inputCls}>
          {Array.from({ length: 12 }).map((_, i) => (
            <option key={i + 1} value={i + 1}>
              {new Date(2000, i, 1).toLocaleString('fr', { month: 'long' })}
            </option>
          ))}
        </select>
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

type FeeData = {
  label: string;
  totalAmount: number;
  installmentCount: number;
  firstDueMonth: number;
};

export function FeeRowActions({
  id,
  initial,
  currency,
}: {
  id: string;
  initial: FeeData;
  currency: string;
}) {
  const t = useTranslations('admin.settings.fees');
  const tForm = useTranslations('admin.settings.fees.form');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');

  function del() {
    if (!confirm(t('confirmDelete'))) return;
    startTransition(async () => {
      const r = await deleteFeeScheduleAction(id);
      if (r.ok) router.refresh();
      else alert(r.error);
    });
  }

  function onSave(formData: FormData) {
    setError('');
    startTransition(async () => {
      const r = await updateFeeScheduleAction(id, formData);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <div className="flex justify-end gap-3">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-xs text-slate-500 hover:text-brand-700"
      >
        {t('actions.edit')}
      </button>
      <button
        type="button"
        onClick={del}
        disabled={isPending}
        className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
      >
        {t('actions.delete')}
      </button>

      {editing && (
        <div
          className="fixed inset-0 z-20 grid place-items-center bg-slate-900/40 p-4"
          onClick={() => setEditing(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-start shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900">{t('actions.edit')}</h3>
            <form action={onSave} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700">{tForm('label')}</label>
                <input type="text" name="label" required defaultValue={initial.label} className={inputCls} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700">
                    {tForm('totalAmount')} ({currency})
                  </label>
                  <input
                    type="number"
                    name="totalAmount"
                    required
                    min={1}
                    step="0.01"
                    defaultValue={initial.totalAmount}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">{tForm('installmentCount')}</label>
                  <input
                    type="number"
                    name="installmentCount"
                    min={1}
                    max={24}
                    defaultValue={initial.installmentCount}
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">{tForm('firstDueMonth')}</label>
                <select name="firstDueMonth" defaultValue={initial.firstDueMonth} className={inputCls}>
                  {Array.from({ length: 12 }).map((_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {new Date(2000, i, 1).toLocaleString('fr', { month: 'long' })}
                    </option>
                  ))}
                </select>
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
                  {tForm('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
                >
                  {isPending ? tForm('saving') : tForm('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Réductions paramétrables (#1/#5) ─────────────────────────────────────

type DiscountData = { label: string; pct: number; active: boolean; order: number };

export function DiscountCreateForm() {
  const t = useTranslations('admin.settings.fees.discounts');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const ref = useRef<HTMLFormElement>(null);

  function onSubmit(formData: FormData) {
    setError('');
    startTransition(async () => {
      const r = await createDiscountRuleAction(formData);
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
        <label className="block text-xs font-medium text-slate-700">{t('label')}</label>
        <input type="text" name="label" required placeholder={t('labelPlaceholder')} className={inputCls} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-slate-700">{t('pct')} (%)</label>
          <input type="number" name="pct" required min={0} max={100} step="0.01" defaultValue={10} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700">{t('order')}</label>
          <input type="number" name="order" min={0} max={999} defaultValue={0} className={inputCls} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="active" defaultChecked className="h-4 w-4 rounded border-slate-300" />
        {t('active')}
      </label>
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

export function DiscountRowActions({ id, initial }: { id: string; initial: DiscountData }) {
  const t = useTranslations('admin.settings.fees.discounts');
  const tFees = useTranslations('admin.settings.fees');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');

  function del() {
    if (!confirm(t('confirmDelete'))) return;
    startTransition(async () => {
      const r = await deleteDiscountRuleAction(id);
      if (r.ok) router.refresh();
      else alert(r.error);
    });
  }

  function onSave(formData: FormData) {
    setError('');
    startTransition(async () => {
      const r = await updateDiscountRuleAction(id, formData);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <div className="flex justify-end gap-3">
      <button type="button" onClick={() => setEditing(true)} className="text-xs text-slate-500 hover:text-brand-700">
        {tFees('actions.edit')}
      </button>
      <button
        type="button"
        onClick={del}
        disabled={isPending}
        className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
      >
        {tFees('actions.delete')}
      </button>

      {editing && (
        <div className="fixed inset-0 z-20 grid place-items-center bg-slate-900/40 p-4" onClick={() => setEditing(false)}>
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-start shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900">{tFees('actions.edit')}</h3>
            <form action={onSave} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700">{t('label')}</label>
                <input type="text" name="label" required defaultValue={initial.label} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">{t('pct')} (%)</label>
                  <input type="number" name="pct" required min={0} max={100} step="0.01" defaultValue={initial.pct} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">{t('order')}</label>
                  <input type="number" name="order" min={0} max={999} defaultValue={initial.order} className={inputCls} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="active" defaultChecked={initial.active} className="h-4 w-4 rounded border-slate-300" />
                {t('active')}
              </label>
              {error && (
                <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div>
              )}
              <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
                >
                  {isPending ? t('saving') : t('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
