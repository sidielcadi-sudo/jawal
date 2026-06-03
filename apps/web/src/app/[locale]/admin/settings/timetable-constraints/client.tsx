'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { TimetableConstraintKindInput } from '@jawal/shared';
import { upsertConstraintAction } from './actions';

export type SubjectOpt = { id: string; label: string };

export type ConstraintRow = {
  kind: TimetableConstraintKindInput;
  enabled: boolean;
  config: Record<string, unknown>;
};

export function ConstraintsForm({
  locale: _locale,
  rows,
  subjects,
}: {
  locale: string;
  rows: ConstraintRow[];
  subjects: SubjectOpt[];
}) {
  const t = useTranslations('admin.timetableConstraints');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedKind, setSavedKind] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {rows.map((r) => (
        <ConstraintCard
          key={r.kind}
          row={r}
          subjects={subjects}
          pending={pending}
          onSave={(form) => {
            setError(null);
            startTransition(async () => {
              const res = await upsertConstraintAction(form);
              if (!res.ok) {
                setError(`${r.kind}: ${res.error}`);
              } else {
                setSavedKind(r.kind);
                setTimeout(() => setSavedKind(null), 1500);
                router.refresh();
              }
            });
          }}
          isSaved={savedKind === r.kind}
          t={t}
        />
      ))}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}
    </div>
  );
}

function ConstraintCard({
  row,
  subjects,
  pending,
  onSave,
  isSaved,
  t,
}: {
  row: ConstraintRow;
  subjects: SubjectOpt[];
  pending: boolean;
  onSave: (fd: FormData) => void;
  isSaved: boolean;
  t: (k: string) => string;
}) {
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    onSave(fd);
  };

  return (
    <form
      onSubmit={submit}
      className={`rounded-2xl border p-5 ${
        row.enabled ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white'
      }`}
    >
      <input type="hidden" name="kind" value={row.kind} />
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-slate-900">
            {t(`kinds.${row.kind}.title`)}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {t(`kinds.${row.kind}.description`)}
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={row.enabled}
            className="h-4 w-4"
          />
          <span className="text-slate-600">{t('enabled')}</span>
        </label>
      </div>

      <div className="mt-4">
        <ConstraintFields row={row} subjects={subjects} t={t} />
      </div>

      <div className="mt-4 flex items-center justify-end gap-2 text-xs">
        {isSaved && (
          <span className="text-emerald-700">✓ {t('saved')}</span>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? t('saving') : t('save')}
        </button>
      </div>
    </form>
  );
}

function ConstraintFields({
  row,
  subjects,
  t,
}: {
  row: ConstraintRow;
  subjects: SubjectOpt[];
  t: (k: string) => string;
}) {
  switch (row.kind) {
    case 'MAX_SAME_SUBJECT_PER_DAY':
    case 'MAX_HOURS_PER_DAY_TEACHER':
    case 'MAX_CONSECUTIVE_HOURS_TEACHER': {
      const def = Number(row.config.max ?? 2);
      const maxBound =
        row.kind === 'MAX_HOURS_PER_DAY_TEACHER'
          ? 12
          : row.kind === 'MAX_CONSECUTIVE_HOURS_TEACHER'
            ? 8
            : 10;
      return (
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
            {t('fields.max')}
          </span>
          <input
            type="number"
            name="max"
            min={1}
            max={maxBound}
            defaultValue={def}
            required
            className="w-32 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
          <p className="mt-1 text-xs text-slate-500">
            {t(`kinds.${row.kind}.hint`)}
          </p>
        </label>
      );
    }
    case 'TEACHER_LUNCH_BREAK': {
      const from = typeof row.config.from === 'string' ? row.config.from : '12:00';
      const to = typeof row.config.to === 'string' ? row.config.to : '14:00';
      return (
        <div className="flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
              {t('fields.from')}
            </span>
            <input
              type="time"
              name="from"
              defaultValue={from}
              required
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
              {t('fields.to')}
            </span>
            <input
              type="time"
              name="to"
              defaultValue={to}
              required
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </label>
          <p className="w-full text-xs text-slate-500">{t('kinds.TEACHER_LUNCH_BREAK.hint')}</p>
        </div>
      );
    }
    case 'NO_GAPS': {
      const def = Number(row.config.weight ?? 5);
      return (
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
            {t('fields.weight')}
          </span>
          <input
            type="number"
            name="weight"
            min={1}
            max={100}
            defaultValue={def}
            required
            className="w-32 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
          <p className="mt-1 text-xs text-slate-500">{t('kinds.NO_GAPS.hint')}</p>
        </label>
      );
    }
    case 'REQUIRES_CONSECUTIVE_SUBJECTS': {
      const ids = Array.isArray(row.config.subjectIds)
        ? (row.config.subjectIds as string[])
        : [];
      const selectedSet = new Set(ids);
      return (
        <div>
          <p className="mb-2 text-xs font-medium uppercase text-slate-500">
            {t('fields.subjectIds')}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {subjects.map((s) => (
              <label
                key={s.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  name="subjectIds"
                  value={s.id}
                  defaultChecked={selectedSet.has(s.id)}
                  className="h-3.5 w-3.5"
                />
                <span>{s.label}</span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {t('kinds.REQUIRES_CONSECUTIVE_SUBJECTS.hint')}
          </p>
        </div>
      );
    }
    case 'REQUIRE_SUBJECT_ROOM_TYPE':
      return (
        <p className="text-xs text-slate-500">{t('kinds.REQUIRE_SUBJECT_ROOM_TYPE.hint')}</p>
      );
  }
}
