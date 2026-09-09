'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import type { ScheduleConflict } from '@/lib/exam-schedule';
import { createExamPaperAction, deleteExamPaperAction, updateExamPaperAction } from './actions';

export type SubjectOpt = {
  id: string;
  label: string;
  /** Coefficient issu de la filière — proposé par défaut à la création. */
  coefficient: number;
  /** Matière évaluée à l'épreuve certificative de la filière. */
  certifying: boolean;
};

export type PaperRow = {
  id: string;
  subjectId: string;
  subjectLabel: string;
  date: string;
  startTime: string;
  durationMin: number;
  coefficient: number;
  maxValue: number;
  markCount: number;
};

/** Bloc d'alerte listant les épreuves percutées. */
function ConflictBox({
  conflicts,
  locale,
  onForce,
  onCancel,
  pending,
}: {
  conflicts: ScheduleConflict[];
  locale: string;
  onForce: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const t = useTranslations('admin.exams.papers');
  return (
    <div className="mt-3 rounded-xl border border-red-300 bg-red-50 p-3">
      <p className="text-sm font-semibold text-red-900">⛔ {t('conflict.title')}</p>
      <ul className="mt-1.5 space-y-1 text-xs text-red-900">
        {conflicts.map((c) => (
          <li key={c.paperId}>
            <strong>{c.subjectLabel}</strong> — {new Date(c.date).toLocaleDateString(locale)}{' '}
            {c.startTime} ({c.durationMin} min) · {c.sessionLabel}
            <span className="block text-[11px] text-red-700">
              {t('conflict.shared', { tracks: c.sharedTracks.join(', ') })}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-red-800">{t('conflict.hint')}</p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
        >
          {t('conflict.change')}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onForce}
          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {t('conflict.force')}
        </button>
      </div>
    </div>
  );
}

/** Formulaire d'ajout d'une épreuve. */
export function NewPaperForm({
  sessionId,
  subjects,
  minDate,
  maxDate,
  disabled,
}: {
  sessionId: string;
  subjects: SubjectOpt[];
  minDate: string;
  maxDate: string;
  disabled: boolean;
}) {
  const t = useTranslations('admin.exams.papers');
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [conflicts, setConflicts] = useState<ScheduleConflict[] | null>(null);
  const [lastForm, setLastForm] = useState<FormData | null>(null);
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? '');

  const chosen = subjects.find((s) => s.id === subjectId);

  function send(fd: FormData) {
    setError('');
    start(async () => {
      const r = await createExamPaperAction(sessionId, fd);
      if (r.ok) {
        setConflicts(null);
        setLastForm(null);
        router.refresh();
        return;
      }
      if (r.error === 'CONFLICT' && r.conflicts) {
        setConflicts(r.conflicts);
        setLastForm(fd);
        return;
      }
      setError(r.error);
    });
  }

  function submit(fd: FormData) {
    setConflicts(null);
    send(fd);
  }

  function force() {
    if (!lastForm) return;
    lastForm.set('force', 'true');
    send(lastForm);
  }

  const inputCls =
    'mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

  if (disabled) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        {t('closedHint')}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-brand-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">{t('add')}</h2>
      <form action={submit} className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="block text-xs font-medium text-slate-700 sm:col-span-2">
          {t('subject')}
          <select
            name="subjectId"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            className={inputCls}
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} (coef. {s.coefficient}
                {s.certifying ? ' ·  certificative' : ''})
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-700">
          {t('date')}
          <input
            type="date"
            name="date"
            required
            min={minDate}
            max={maxDate}
            className={inputCls}
          />
        </label>
        <label className="block text-xs font-medium text-slate-700">
          {t('startTime')}
          <input type="time" name="startTime" required defaultValue="08:00" className={inputCls} />
        </label>
        <label className="block text-xs font-medium text-slate-700">
          {t('duration')}
          <input
            type="number"
            name="durationMin"
            required
            min={15}
            max={480}
            step={5}
            defaultValue={120}
            className={inputCls}
          />
        </label>
        <label className="block text-xs font-medium text-slate-700">
          {t('coefficient')}
          <input
            type="number"
            name="coefficient"
            min={0.5}
            max={20}
            step={0.5}
            // Le coefficient de la filière est la valeur attendue dans 99 % des
            // cas : on la propose, l'agent peut la corriger.
            key={subjectId}
            defaultValue={chosen?.coefficient ?? 1}
            className={inputCls}
          />
        </label>
        <label className="block text-xs font-medium text-slate-700">
          {t('maxValue')}
          <input
            type="number"
            name="maxValue"
            min={1}
            max={100}
            step={1}
            defaultValue={20}
            className={inputCls}
          />
        </label>
        <div className="flex items-end sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {pending ? t('saving') : t('addAction')}
          </button>
        </div>
      </form>

      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      {conflicts && (
        <ConflictBox
          conflicts={conflicts}
          locale={locale}
          pending={pending}
          onForce={force}
          onCancel={() => setConflicts(null)}
        />
      )}
    </div>
  );
}

/** Ligne d'épreuve : édition en place de l'horaire, ou suppression. */
export function PaperRowActions({
  paper,
  minDate,
  maxDate,
  disabled,
}: {
  paper: PaperRow;
  minDate: string;
  maxDate: string;
  disabled: boolean;
}) {
  const t = useTranslations('admin.exams.papers');
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [conflicts, setConflicts] = useState<ScheduleConflict[] | null>(null);
  const [lastForm, setLastForm] = useState<FormData | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function send(fd: FormData) {
    setError('');
    start(async () => {
      const r = await updateExamPaperAction(paper.id, fd);
      if (r.ok) {
        setEditing(false);
        setConflicts(null);
        router.refresh();
        return;
      }
      if (r.error === 'CONFLICT' && r.conflicts) {
        setConflicts(r.conflicts);
        setLastForm(fd);
        return;
      }
      setError(r.error);
    });
  }

  function remove() {
    setError('');
    start(async () => {
      const r = await deleteExamPaperAction(paper.id);
      if (!r.ok) return setError(r.error);
      setConfirmDelete(false);
      router.refresh();
    });
  }

  if (disabled) return <span className="text-xs text-slate-400">—</span>;

  const inputCls = 'rounded border border-slate-300 px-2 py-0.5 text-xs';

  if (editing) {
    return (
      <div className="text-start">
        <form
          action={(fd) => {
            setConflicts(null);
            fd.set('subjectId', paper.subjectId);
            fd.set('coefficient', String(paper.coefficient));
            fd.set('maxValue', String(paper.maxValue));
            send(fd);
          }}
          className="flex flex-wrap items-center justify-end gap-1.5"
        >
          <input
            type="date"
            name="date"
            required
            min={minDate}
            max={maxDate}
            defaultValue={paper.date}
            className={inputCls}
          />
          <input
            type="time"
            name="startTime"
            required
            defaultValue={paper.startTime}
            className={inputCls}
          />
          <input
            type="number"
            name="durationMin"
            required
            min={15}
            max={480}
            step={5}
            defaultValue={paper.durationMin}
            className={`${inputCls} w-20`}
          />
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-700"
          >
            {t('cancel')}
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-brand-600 px-2.5 py-0.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {t('save')}
          </button>
        </form>
        {error && <p className="mt-1 text-[11px] text-red-700">{error}</p>}
        {conflicts && (
          <ConflictBox
            conflicts={conflicts}
            locale={locale}
            pending={pending}
            onForce={() => {
              if (!lastForm) return;
              lastForm.set('force', 'true');
              send(lastForm);
            }}
            onCancel={() => setConflicts(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
      >
        {t('reschedule')}
      </button>
      {confirmDelete ? (
        <>
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={remove}
            className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {t('confirmDelete')}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="rounded-lg border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
        >
          {t('delete')}
        </button>
      )}
      {error && <span className="text-[11px] text-red-700">{error}</span>}
    </div>
  );
}
