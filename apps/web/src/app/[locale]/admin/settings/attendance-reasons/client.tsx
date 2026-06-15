'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  createAttendanceReasonAction,
  updateAttendanceReasonAction,
  deleteAttendanceReasonAction,
} from './actions';

type Reason = { id: string; label: string; color: string | null; order: number; active: boolean };

const COLORS = ['cyan', 'rose', 'blue', 'amber', 'green', 'red', 'purple', 'slate'] as const;
const BAR: Record<string, string> = {
  cyan: 'bg-cyan-400',
  rose: 'bg-rose-400',
  blue: 'bg-blue-500',
  amber: 'bg-amber-400',
  green: 'bg-green-500',
  red: 'bg-red-500',
  purple: 'bg-purple-500',
  slate: 'bg-slate-300',
};

export function AttendanceReasonsManager({ reasons }: { reasons: Reason[] }) {
  const t = useTranslations('admin.settings.attendanceReasons');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<string | null>(null);

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError('');
    start(async () => {
      const r = await action();
      if (!r.ok) setError(r.error ?? 'Erreur');
      else {
        setEditing(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 text-start">{t('label')}</th>
              <th className="px-4 py-2 text-start">{t('color')}</th>
              <th className="w-20 px-4 py-2 text-end">{t('order')}</th>
              <th className="w-20 px-4 py-2 text-center">{t('active')}</th>
              <th className="w-28 px-4 py-2 text-end">{t('actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {reasons.map((r) =>
              editing === r.id ? (
                <tr key={r.id} className="bg-slate-50/60">
                  <td colSpan={5} className="px-4 py-3">
                    <ReasonForm
                      initial={r}
                      pending={pending}
                      onCancel={() => setEditing(null)}
                      onSubmit={(fd) => run(() => updateAttendanceReasonAction(r.id, fd))}
                    />
                  </td>
                </tr>
              ) : (
                <tr key={r.id}>
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-2">
                      <span className={`h-4 w-1.5 rounded ${BAR[r.color ?? 'slate']}`} />
                      <span className="font-medium text-slate-800">{r.label}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500">{r.color ?? '—'}</td>
                  <td className="px-4 py-2 text-end tabular-nums text-slate-600">{r.order}</td>
                  <td className="px-4 py-2 text-center">{r.active ? '✓' : '—'}</td>
                  <td className="px-4 py-2 text-end">
                    <button
                      type="button"
                      onClick={() => setEditing(r.id)}
                      className="text-xs text-brand-700 hover:underline"
                    >
                      {t('edit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(t('confirmDelete')))
                          run(() => deleteAttendanceReasonAction(r.id));
                      }}
                      className="ms-3 text-xs text-red-600 hover:underline"
                    >
                      {t('delete')}
                    </button>
                  </td>
                </tr>
              ),
            )}
            {reasons.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  {t('empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">{t('addTitle')}</h3>
        <ReasonForm
          pending={pending}
          onSubmit={(fd) => run(() => createAttendanceReasonAction(fd))}
        />
      </div>
    </div>
  );
}

function ReasonForm({
  initial,
  pending,
  onSubmit,
  onCancel,
}: {
  initial?: Reason;
  pending: boolean;
  onSubmit: (fd: FormData) => void;
  onCancel?: () => void;
}) {
  const t = useTranslations('admin.settings.attendanceReasons');
  return (
    <form
      action={onSubmit}
      className="flex flex-wrap items-end gap-2"
    >
      <label className="flex flex-col text-xs text-slate-500">
        {t('label')}
        <input
          name="label"
          defaultValue={initial?.label}
          required
          maxLength={80}
          className="mt-0.5 w-56 rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
        />
      </label>
      <label className="flex flex-col text-xs text-slate-500">
        {t('color')}
        <select
          name="color"
          defaultValue={initial?.color ?? 'slate'}
          className="mt-0.5 rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
        >
          {COLORS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col text-xs text-slate-500">
        {t('order')}
        <input
          name="order"
          type="number"
          min={0}
          max={999}
          defaultValue={initial?.order ?? 0}
          className="mt-0.5 w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
        />
      </label>
      <label className="flex items-center gap-1.5 pb-1.5 text-xs text-slate-600">
        <input name="active" type="checkbox" defaultChecked={initial?.active ?? true} />
        {t('active')}
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {initial ? t('save') : t('add')}
      </button>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          {t('cancel')}
        </button>
      )}
    </form>
  );
}
