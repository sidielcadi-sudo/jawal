'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createSlotAction, deleteSlotAction, updateSlotAction } from './actions';

type Slot = {
  id: string;
  startTime: string;
  endTime: string;
  label: string | null;
  isBreak: boolean;
  order: number;
};

export function SlotsManager({
  locale: _locale,
  initialSlots,
}: {
  locale: string;
  initialSlots: Slot[];
}) {
  const t = useTranslations('admin.timetableSlots');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = editId
        ? await updateSlotAction(editId, fd)
        : await createSlotAction(fd);
      if (!res.ok) {
        setError(res.error);
      } else {
        (e.target as HTMLFormElement).reset();
        setEditId(null);
        router.refresh();
      }
    });
  };

  const onEdit = (s: Slot) => {
    setEditId(s.id);
    // Le form va se pré-remplir via defaultValue dynamique (key change)
  };

  const onDelete = (id: string) => {
    if (!confirm(t('confirmDelete'))) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteSlotAction(id);
      if (!res.ok) {
        setError(res.error);
      } else {
        router.refresh();
      }
    });
  };

  const editing = editId ? initialSlots.find((s) => s.id === editId) : null;

  return (
    <div className="space-y-6">
      {/* Form création / édition */}
      <form
        key={editId ?? 'new'}
        onSubmit={onSubmit}
        className="rounded-2xl border border-slate-200 bg-white p-5"
      >
        <h2 className="mb-3 text-sm font-semibold text-slate-700">
          {editing ? t('editTitle') : t('newTitle')}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Field label={t('startTime')}>
            <input
              type="time"
              name="startTime"
              required
              defaultValue={editing?.startTime ?? '08:00'}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </Field>
          <Field label={t('endTime')}>
            <input
              type="time"
              name="endTime"
              required
              defaultValue={editing?.endTime ?? '09:00'}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </Field>
          <Field label={t('label')}>
            <input
              type="text"
              name="label"
              maxLength={120}
              defaultValue={editing?.label ?? ''}
              placeholder={t('labelPlaceholder')}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </Field>
          <Field label={t('order')}>
            <input
              type="number"
              name="order"
              min={0}
              max={999}
              defaultValue={editing?.order ?? 0}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </Field>
          <Field label={t('isBreak')}>
            <label className="mt-1 inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="isBreak"
                defaultChecked={editing?.isBreak ?? false}
                className="h-4 w-4"
              />
              <span className="text-slate-600">{t('isBreakHint')}</span>
            </label>
          </Field>
        </div>
        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}
        <div className="mt-3 flex items-center justify-end gap-2">
          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditId(null);
                setError(null);
              }}
              className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-sm hover:bg-slate-50"
            >
              {t('cancel')}
            </button>
          )}
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {pending ? t('saving') : editing ? t('save') : t('add')}
          </button>
        </div>
      </form>

      {/* Liste des slots */}
      <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
            <tr>
              <th className="px-4 py-3 text-end">{t('order')}</th>
              <th className="px-4 py-3 text-start">{t('startTime')}</th>
              <th className="px-4 py-3 text-start">{t('endTime')}</th>
              <th className="px-4 py-3 text-start">{t('label')}</th>
              <th className="px-4 py-3 text-start">{t('type')}</th>
              <th className="px-4 py-3 text-end"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {initialSlots.map((s) => (
              <tr key={s.id} className={s.isBreak ? 'bg-amber-50/30' : ''}>
                <td className="px-4 py-2 text-end text-xs tabular-nums text-slate-500">
                  {s.order}
                </td>
                <td className="px-4 py-2 font-medium tabular-nums">{s.startTime}</td>
                <td className="px-4 py-2 tabular-nums">{s.endTime}</td>
                <td className="px-4 py-2 text-slate-700">{s.label ?? '—'}</td>
                <td className="px-4 py-2">
                  {s.isBreak ? (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                      {t('typeBreak')}
                    </span>
                  ) : (
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                      {t('typeCourse')}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-end">
                  <button
                    type="button"
                    onClick={() => onEdit(s)}
                    className="text-xs text-brand-700 hover:underline"
                  >
                    {t('edit')}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(s.id)}
                    className="ms-3 text-xs text-red-600 hover:underline"
                  >
                    {t('delete')}
                  </button>
                </td>
              </tr>
            ))}
            {initialSlots.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                  {t('empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium uppercase text-slate-500">{label}</span>
      {children}
    </label>
  );
}
