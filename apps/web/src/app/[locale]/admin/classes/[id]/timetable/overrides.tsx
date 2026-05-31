'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  createOverrideAction,
  deleteOverrideAction,
} from './override-actions';

type EntryOpt = {
  id: string;
  label: string; // "Lundi 08:00 — Mathématiques"
};

type Override = {
  id: string;
  date: string; // YYYY-MM-DD
  kind: 'CANCELLED' | 'SUBSTITUTION';
  reason: string | null;
  entryLabel: string;
  substituteTeacher: string | null;
  substituteRoom: string | null;
  substituteSubject: string | null;
};

export function OverridesPanel({
  classId,
  entries,
  teachers,
  rooms,
  subjects,
  overrides,
}: {
  classId: string;
  entries: EntryOpt[];
  teachers: { id: string; label: string }[];
  rooms: { id: string; label: string }[];
  subjects: { id: string; label: string }[];
  overrides: Override[];
}) {
  const t = useTranslations('admin.timetable.overrides');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<'CANCELLED' | 'SUBSTITUTION'>('CANCELLED');

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.append('classId', classId);
    startTransition(async () => {
      const res = await createOverrideAction(fd);
      if (!res.ok) {
        setError(res.error);
      } else {
        setOpen(false);
        router.refresh();
      }
    });
  };

  const onDelete = (id: string) => {
    if (!confirm(t('confirmDelete'))) return;
    startTransition(async () => {
      const res = await deleteOverrideAction(id, classId);
      if (!res.ok) alert(res.error);
      router.refresh();
    });
  };

  return (
    <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">
          {t('title')}{' '}
          <span className="ms-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-600">
            {overrides.length}
          </span>
        </h2>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
        >
          + {t('add')}
        </button>
      </div>

      {overrides.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500">{t('empty')}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {overrides.map((o) => (
            <li
              key={o.id}
              className={`rounded-lg border px-3 py-2 text-xs ${
                o.kind === 'CANCELLED'
                  ? 'border-red-200 bg-red-50'
                  : 'border-blue-200 bg-blue-50'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold tabular-nums text-slate-900">
                    {o.date}
                  </span>
                  <span className="mx-2 text-slate-400">·</span>
                  <span className="text-slate-700">{o.entryLabel}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                      o.kind === 'CANCELLED'
                        ? 'bg-red-200 text-red-800'
                        : 'bg-blue-200 text-blue-800'
                    }`}
                  >
                    {t(`kind.${o.kind}`)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onDelete(o.id)}
                    className="text-[10px] text-red-600 hover:underline"
                  >
                    {t('remove')}
                  </button>
                </div>
              </div>
              {o.kind === 'SUBSTITUTION' && (
                <div className="mt-1 text-[11px] text-slate-600">
                  {o.substituteTeacher && (
                    <span className="me-3">👤 {o.substituteTeacher}</span>
                  )}
                  {o.substituteRoom && <span className="me-3">📍 {o.substituteRoom}</span>}
                  {o.substituteSubject && (
                    <span className="me-3">📚 {o.substituteSubject}</span>
                  )}
                </div>
              )}
              {o.reason && (
                <div className="mt-1 text-[11px] italic text-slate-500">« {o.reason} »</div>
              )}
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setOpen(false)}
        >
          <form
            onSubmit={onSubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5"
          >
            <h3 className="text-sm font-semibold text-slate-700">{t('newTitle')}</h3>

            <div className="mt-4 space-y-3">
              <Field label={t('entry')}>
                <select
                  name="entryId"
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">{t('chooseEntry')}</option>
                  {entries.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('date')}>
                <input
                  type="date"
                  name="date"
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </Field>
              <Field label={t('kind.label')}>
                <select
                  name="kind"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as 'CANCELLED' | 'SUBSTITUTION')}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="CANCELLED">🚫 {t('kind.CANCELLED')}</option>
                  <option value="SUBSTITUTION">🔄 {t('kind.SUBSTITUTION')}</option>
                </select>
              </Field>

              {kind === 'SUBSTITUTION' && (
                <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/40 p-3">
                  <p className="text-[11px] text-blue-700">{t('substituteHint')}</p>
                  <Field label={t('substituteTeacher')}>
                    <select
                      name="substituteTeacherId"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="">—</option>
                      {teachers.map((tt) => (
                        <option key={tt.id} value={tt.id}>
                          {tt.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t('substituteRoom')}>
                    <select
                      name="substituteRoomId"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="">—</option>
                      {rooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t('substituteSubject')}>
                    <select
                      name="substituteSubjectId"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="">—</option>
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              )}

              <Field label={t('reason')}>
                <input
                  type="text"
                  name="reason"
                  placeholder={t('reasonPlaceholder')}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </Field>
            </div>

            {error && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                {error}
              </div>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-sm hover:bg-slate-50"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {pending ? t('saving') : t('save')}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
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
