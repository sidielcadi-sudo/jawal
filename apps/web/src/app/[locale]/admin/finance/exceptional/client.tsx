'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  createFeeAction,
  deleteFeeAction,
  closeFeeAction,
  publishFeeAction,
  createFeeTypeAction,
  updateFeeTypeAction,
  deleteFeeTypeAction,
} from './actions';

type FeeType = { id: string; labelFr: string; labelAr: string; order: number; active: boolean };
type YearOpt = { id: string; label: string };
type ClassWithStudents = { id: string; name: string; students: { id: string; name: string }[] };

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  function run(action: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError('');
    start(async () => {
      const r = await action();
      if (!r.ok) setError(r.error ?? 'Erreur');
      else {
        onOk?.();
        router.refresh();
      }
    });
  }
  return { pending, error, run };
}

/* ----------------------------- Create fee ------------------------------- */

export function CreateFeeForm({
  years,
  types,
  currency,
  classes,
}: {
  years: YearOpt[];
  types: FeeType[];
  currency: string;
  classes: ClassWithStudents[];
}) {
  const t = useTranslations('admin.exceptionalFees');
  const { pending, error, run } = useRun();
  const [open, setOpen] = useState<string | null>(null);
  const inputCls =
    'mt-0.5 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-800';

  return (
    <form
      action={(fd) => run(() => createFeeAction(fd), () => { (document.getElementById('fee-create-form') as HTMLFormElement)?.reset(); setOpen(null); })}
      id="fee-create-form"
      className="space-y-3"
    >
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
      )}
      <label className="block text-xs text-slate-500">
        {t('form.label')}
        <input name="label" required maxLength={160} className={inputCls} placeholder={t('form.labelPh')} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs text-slate-500">
          {t('form.year')}
          <select name="academicYearId" required className={inputCls} defaultValue={years[0]?.id}>
            {years.map((y) => (
              <option key={y.id} value={y.id}>{y.label}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-slate-500">
          {t('form.type')}
          <select name="typeId" className={inputCls} defaultValue="">
            <option value="">—</option>
            {types.filter((ty) => ty.active).map((ty) => (
              <option key={ty.id} value={ty.id}>{ty.labelFr}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs text-slate-500">
          {t('form.amount')} ({currency})
          <input name="amount" type="number" min={0} step="0.01" required className={inputCls} />
        </label>
        <label className="block text-xs text-slate-500">
          {t('form.activityDate')}
          <input name="activityDate" type="date" className={inputCls} />
        </label>
      </div>
      <label className="block text-xs text-slate-500">
        {t('form.dueDate')}
        <input name="dueDate" type="date" className={inputCls} />
      </label>
      <label className="block text-xs text-slate-500">
        {t('form.description')}
        <textarea name="description" rows={2} maxLength={2000} className={inputCls} />
      </label>

      {/* Ciblage : classe(s) concernée(s) + élèves (optionnel) */}
      <div>
        <div className="mb-1 text-xs font-medium text-slate-600">{t('form.target')}</div>
        <p className="mb-1.5 text-[11px] text-slate-400">{t('form.targetHint')}</p>
        <ul className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-slate-100 p-2">
          {classes.map((c) => (
            <li key={c.id}>
              <div className="flex items-center justify-between gap-2 px-1 py-1">
                <label className="flex items-center gap-2 text-sm text-slate-800">
                  <input type="checkbox" name="classIds" value={c.id} />
                  <span className="font-medium">{c.name}</span>
                  <span className="text-xs text-slate-400">({c.students.length})</span>
                </label>
                {c.students.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setOpen(open === c.id ? null : c.id)}
                    className="text-xs text-brand-700 hover:underline"
                  >
                    {open === c.id ? t('assign.hideStudents') : t('assign.pickStudents')}
                  </button>
                )}
              </div>
              {open === c.id && (
                <ul className="ms-6 space-y-0.5 border-s border-slate-100 ps-3 pb-1">
                  {c.students.map((s) => (
                    <li key={s.id}>
                      <label className="flex items-center gap-2 py-0.5 text-xs text-slate-600">
                        <input type="checkbox" name="studentIds" value={s.id} />
                        {s.name}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
          {classes.length === 0 && (
            <li className="px-2 py-3 text-center text-xs text-slate-400">{t('assign.noClass')}</li>
          )}
        </ul>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input name="mandatory" type="checkbox" />
        {t('form.mandatory')}
      </label>
      <p className="text-[11px] text-slate-400">{t('form.mandatoryHint')}</p>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {t('form.create')}
      </button>
    </form>
  );
}

/* ----------------------------- Fee actions ------------------------------ */

export function FeeRowActions({ id, status }: { id: string; status: string }) {
  const t = useTranslations('admin.exceptionalFees');
  const { pending, run } = useRun();
  return (
    <span className="flex items-center justify-end gap-3">
      {status === 'DRAFT' && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => publishFeeAction(id))}
          className="text-xs font-medium text-emerald-700 hover:underline disabled:opacity-50"
        >
          {t('publish')}
        </button>
      )}
      {status === 'PUBLISHED' && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => closeFeeAction(id))}
          className="text-xs text-slate-600 hover:underline disabled:opacity-50"
        >
          {t('close')}
        </button>
      )}
      {/* Suppression réservée aux brouillons : un frais publié ne se supprime pas. */}
      {status === 'DRAFT' && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (window.confirm(t('confirmDelete'))) run(() => deleteFeeAction(id));
          }}
          className="text-xs text-red-600 hover:underline disabled:opacity-50"
        >
          {t('delete')}
        </button>
      )}
    </span>
  );
}

/* --------------------------- Types catalog ------------------------------ */

export function FeeTypesManager({ types }: { types: FeeType[] }) {
  const t = useTranslations('admin.exceptionalFees.types');
  const { pending, error, run } = useRun();
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
      )}
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
        {types.map((ty) =>
          editing === ty.id ? (
            <li key={ty.id} className="bg-slate-50/60 p-2">
              <TypeForm
                initial={ty}
                pending={pending}
                onCancel={() => setEditing(null)}
                onSubmit={(fd) => run(() => updateFeeTypeAction(ty.id, fd), () => setEditing(null))}
              />
            </li>
          ) : (
            <li key={ty.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className={ty.active ? 'text-slate-800' : 'text-slate-400 line-through'}>
                {ty.labelFr} <span className="text-xs text-slate-400">· {ty.labelAr}</span>
              </span>
              <span className="flex items-center gap-3">
                <button type="button" onClick={() => setEditing(ty.id)} className="text-xs text-brand-700 hover:underline">
                  {t('edit')}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => { if (window.confirm(t('confirmDelete'))) run(() => deleteFeeTypeAction(ty.id)); }}
                  className="text-xs text-red-600 hover:underline disabled:opacity-50"
                >
                  {t('delete')}
                </button>
              </span>
            </li>
          ),
        )}
        {types.length === 0 && <li className="px-3 py-4 text-center text-xs text-slate-400">{t('empty')}</li>}
      </ul>
      <div className="rounded-xl border border-slate-100 p-3">
        <h4 className="mb-2 text-xs font-semibold text-slate-600">{t('add')}</h4>
        <TypeForm pending={pending} onSubmit={(fd) => run(() => createFeeTypeAction(fd))} />
      </div>
    </div>
  );
}

function TypeForm({
  initial,
  pending,
  onSubmit,
  onCancel,
}: {
  initial?: FeeType;
  pending: boolean;
  onSubmit: (fd: FormData) => void;
  onCancel?: () => void;
}) {
  const t = useTranslations('admin.exceptionalFees.types');
  const inputCls = 'rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800';
  return (
    <form action={onSubmit} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col text-[11px] text-slate-500">
        {t('labelFr')}
        <input name="labelFr" defaultValue={initial?.labelFr} required maxLength={80} className={`mt-0.5 w-36 ${inputCls}`} />
      </label>
      <label className="flex flex-col text-[11px] text-slate-500">
        {t('labelAr')}
        <input name="labelAr" defaultValue={initial?.labelAr} required maxLength={80} dir="rtl" className={`mt-0.5 w-36 ${inputCls}`} />
      </label>
      <label className="flex flex-col text-[11px] text-slate-500">
        {t('order')}
        <input name="order" type="number" min={0} max={999} defaultValue={initial?.order ?? 0} className={`mt-0.5 w-16 ${inputCls}`} />
      </label>
      <label className="flex items-center gap-1.5 pb-1.5 text-[11px] text-slate-600">
        <input name="active" type="checkbox" defaultChecked={initial?.active ?? true} />
        {t('active')}
      </label>
      <button type="submit" disabled={pending} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50">
        {initial ? t('save') : t('add')}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
          {t('cancel')}
        </button>
      )}
    </form>
  );
}
