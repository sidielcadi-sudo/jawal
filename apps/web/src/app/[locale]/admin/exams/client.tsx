'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createExamSessionAction, setExamSessionStatusAction } from './actions';

export type LevelOpt = { id: string; label: string };
export type TrackOpt = { id: string; label: string; levelId: string };
export type PeriodOpt = { id: string; label: string };

const KINDS = ['SEMESTRIEL', 'REGIONAL', 'NATIONAL', 'BLANC'] as const;

/** Formulaire de création d'une session d'examen. */
export function NewSessionForm({
  levels,
  tracks,
  periods,
}: {
  levels: LevelOpt[];
  tracks: TrackOpt[];
  periods: PeriodOpt[];
}) {
  const t = useTranslations('admin.exams');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [levelId, setLevelId] = useState(levels[0]?.id ?? '');
  const [selected, setSelected] = useState<string[]>([]);

  // Les filières proposées suivent le niveau : une session 2BAC ne peut pas
  // porter sur une filière de tronc commun.
  const levelTracks = useMemo(() => tracks.filter((x) => x.levelId === levelId), [tracks, levelId]);

  function submit(fd: FormData) {
    setError('');
    fd.set('levelId', levelId);
    for (const id of selected) fd.append('trackIds', id);
    start(async () => {
      const r = await createExamSessionAction(fd);
      if (!r.ok) return setError(r.error);
      setOpen(false);
      setSelected([]);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        + {t('newSession')}
      </button>
    );
  }

  const inputCls =
    'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

  return (
    <form action={submit} className="rounded-2xl border border-brand-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">{t('newSession')}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-slate-700 sm:col-span-2">
          {t('form.label')}
          <input name="label" required maxLength={120} className={inputCls} />
        </label>
        <label className="block text-xs font-medium text-slate-700">
          {t('form.kind')}
          <select name="kind" className={inputCls} defaultValue="SEMESTRIEL">
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kinds.${k}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-700">
          {t('form.level')}
          <select
            value={levelId}
            onChange={(e) => {
              setLevelId(e.target.value);
              setSelected([]);
            }}
            className={inputCls}
          >
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-700">
          {t('form.period')}
          <select name="periodId" className={inputCls} defaultValue="">
            <option value="">{t('form.noPeriod')}</option>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-medium text-slate-700">
            {t('form.startDate')}
            <input type="date" name="startDate" required className={inputCls} />
          </label>
          <label className="block text-xs font-medium text-slate-700">
            {t('form.endDate')}
            <input type="date" name="endDate" required className={inputCls} />
          </label>
        </div>
      </div>

      <fieldset className="mt-3">
        <legend className="text-xs font-medium text-slate-700">{t('form.tracks')}</legend>
        {levelTracks.length === 0 ? (
          <p className="mt-1 text-xs text-amber-700">{t('form.noTracks')}</p>
        ) : (
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5">
            {levelTracks.map((tr) => (
              <label key={tr.id} className="flex items-center gap-1.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={selected.includes(tr.id)}
                  onChange={(e) =>
                    setSelected((cur) =>
                      e.target.checked ? [...cur, tr.id] : cur.filter((x) => x !== tr.id),
                    )
                  }
                />
                {tr.label}
              </label>
            ))}
          </div>
        )}
        <p className="mt-1 text-[11px] text-slate-500">{t('form.tracksHint')}</p>
      </fieldset>

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="mixClasses" defaultChecked />
          {t('form.mixClasses')}
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="anonymized" defaultChecked />
          {t('form.anonymized')}
        </label>
      </div>

      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
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
  );
}

/** Changement de statut d'une session (brouillon → publiée → clôturée). */
export function SessionStatusButtons({
  sessionId,
  status,
}: {
  sessionId: string;
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
}) {
  const t = useTranslations('admin.exams');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);

  function set(next: 'DRAFT' | 'PUBLISHED' | 'CLOSED') {
    setError('');
    start(async () => {
      const r = await setExamSessionStatusAction(sessionId, next);
      if (!r.ok) return setError(r.error);
      setConfirmClose(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {status === 'DRAFT' && (
        <button
          type="button"
          disabled={pending}
          onClick={() => set('PUBLISHED')}
          className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {t('actions.publish')}
        </button>
      )}
      {status === 'PUBLISHED' &&
        (confirmClose ? (
          <>
            <span className="text-[11px] text-amber-800">{t('actions.closeConfirm')}</span>
            <button
              type="button"
              onClick={() => setConfirmClose(false)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => set('CLOSED')}
              className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {t('actions.close')}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => set('DRAFT')}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              {t('actions.unpublish')}
            </button>
            <button
              type="button"
              onClick={() => setConfirmClose(true)}
              className="rounded-lg border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
            >
              {t('actions.close')}
            </button>
          </>
        ))}
      {error && <span className="text-[11px] text-red-700">{error}</span>}
    </div>
  );
}
