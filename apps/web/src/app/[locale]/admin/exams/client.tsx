'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  createExamSessionAction,
  deleteExamSessionAction,
  setExamSessionStatusAction,
  updateExamSessionAction,
} from './actions';
import { EXAM_KIND_GROUPS, isOfficialKind, type SessionLock } from '@/lib/exam-kinds';

export type LevelOpt = { id: string; label: string; hasTracks: boolean };
export type TrackOpt = { id: string; label: string; levelId: string };
export type PeriodOpt = { id: string; label: string };

/** Valeurs d'une session existante, pour préremplir la modification. */
export type SessionInitial = {
  id: string;
  label: string;
  kind: string;
  levelId: string;
  periodId: string | null;
  startDate: string;
  endDate: string;
  trackIds: string[];
  mixClasses: boolean;
  anonymized: boolean;
};

type Options = { levels: LevelOpt[]; tracks: TrackOpt[]; periods: PeriodOpt[] };

/**
 * Formulaire d'une session, en création comme en modification.
 *
 * Le type pilote le niveau : un examen officiel (régional, national) porte sur
 * des filières, donc seuls les niveaux qui en ont sont proposés. Un contrôle
 * ou un devoir se programme sur n'importe quel niveau, collège compris.
 */
function SessionForm({
  levels,
  tracks,
  periods,
  initial,
  title,
  submitLabel,
  onCancel,
  onSubmit,
  pending,
  error,
}: Options & {
  initial?: SessionInitial;
  title: string;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (fd: FormData) => void;
  pending: boolean;
  error: string;
}) {
  const t = useTranslations('admin.exams');
  const [kind, setKind] = useState<string>(initial?.kind ?? EXAM_KIND_GROUPS[0].kinds[0]);
  const allowedLevels = useMemo(
    () => (isOfficialKind(kind) ? levels.filter((l) => l.hasTracks) : levels),
    [levels, kind],
  );
  const [levelId, setLevelId] = useState(initial?.levelId ?? allowedLevels[0]?.id ?? '');
  const [selected, setSelected] = useState<string[]>(initial?.trackIds ?? []);

  const level = levels.find((l) => l.id === levelId) ?? null;
  // Les filières proposées suivent le niveau : une session 2BAC ne peut pas
  // porter sur une filière de tronc commun.
  const levelTracks = useMemo(() => tracks.filter((x) => x.levelId === levelId), [tracks, levelId]);

  function changeKind(next: string) {
    setKind(next);
    const allowed = isOfficialKind(next) ? levels.filter((l) => l.hasTracks) : levels;
    if (!allowed.some((l) => l.id === levelId)) {
      setLevelId(allowed[0]?.id ?? '');
      setSelected([]);
    }
  }

  function submit(fd: FormData) {
    fd.set('kind', kind);
    fd.set('levelId', levelId);
    fd.delete('trackIds');
    for (const id of selected) fd.append('trackIds', id);
    onSubmit(fd);
  }

  const inputCls =
    'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

  return (
    <form action={submit} className="rounded-2xl border border-brand-200 bg-white p-4 text-start">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-slate-700 sm:col-span-2">
          {t('form.label')}
          <input
            name="label"
            required
            maxLength={120}
            defaultValue={initial?.label ?? ''}
            className={inputCls}
          />
        </label>
        <label className="block text-xs font-medium text-slate-700">
          {t('form.kind')}
          <select value={kind} onChange={(e) => changeKind(e.target.value)} className={inputCls}>
            {EXAM_KIND_GROUPS.map((g) => (
              <optgroup key={g.key} label={t(`categories.${g.key}`)}>
                {g.kinds.map((k) => (
                  <option key={k} value={k}>
                    {t(`kinds.${k}`)}
                  </option>
                ))}
              </optgroup>
            ))}
            {/* Ancien libellé : visible seulement sur une session qui le porte. */}
            {initial?.kind === 'SEMESTRIEL' && <option value="SEMESTRIEL">{t('kinds.SEMESTRIEL')}</option>}
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
            {allowedLevels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
          {isOfficialKind(kind) && allowedLevels.length === 0 && (
            <span className="mt-1 block text-[11px] text-amber-700">{t('form.officialNeedsTracks')}</span>
          )}
        </label>
        <label className="block text-xs font-medium text-slate-700">
          {t('form.period')}
          <select name="periodId" className={inputCls} defaultValue={initial?.periodId ?? ''}>
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
            <input
              type="date"
              name="startDate"
              required
              defaultValue={initial?.startDate ?? ''}
              className={inputCls}
            />
          </label>
          <label className="block text-xs font-medium text-slate-700">
            {t('form.endDate')}
            <input
              type="date"
              name="endDate"
              required
              defaultValue={initial?.endDate ?? ''}
              className={inputCls}
            />
          </label>
        </div>
      </div>

      {level?.hasTracks && (
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
      )}

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="mixClasses" defaultChecked={initial?.mixClasses ?? true} />
          {t('form.mixClasses')}
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="anonymized" defaultChecked={initial?.anonymized ?? true} />
          {t('form.anonymized')}
        </label>
      </div>

      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          {t('cancel')}
        </button>
        <button
          type="submit"
          disabled={pending || !levelId}
          className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? t('saving') : submitLabel}
        </button>
      </div>
    </form>
  );
}

/** Création d'une session. */
export function NewSessionForm(props: Options) {
  const t = useTranslations('admin.exams');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState('');

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

  return (
    <SessionForm
      {...props}
      title={t('newSession')}
      submitLabel={t('save')}
      pending={pending}
      error={error}
      onCancel={() => setOpen(false)}
      onSubmit={(fd) => {
        setError('');
        start(async () => {
          const r = await createExamSessionAction(fd);
          if (!r.ok) return setError(r.error);
          setOpen(false);
          router.refresh();
        });
      }}
    />
  );
}

/**
 * Modifier et supprimer une session.
 *
 * « Modifier » reste visible même verrouillé, grisé avec la raison : un bouton
 * qui disparaît ne dit pas pourquoi. « Supprimer » n'apparaît qu'à
 * l'administrateur.
 */
export function SessionManageButtons({
  session,
  lock,
  markCount,
  canDelete,
  ...options
}: Options & {
  session: SessionInitial;
  lock: SessionLock;
  markCount: number;
  canDelete: boolean;
}) {
  const t = useTranslations('admin.exams');
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState('');

  const lockReason =
    lock === 'MARKS'
      ? t('actions.lockedMarks')
      : lock === 'PAST'
        ? t('actions.lockedPast')
        : lock === 'CLOSED'
          ? t('status.CLOSED')
          : undefined;

  function remove() {
    setError('');
    start(async () => {
      const r = await deleteExamSessionAction(session.id);
      if (!r.ok) return setError(r.error);
      setConfirmDelete(false);
      router.refresh();
    });
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center justify-end gap-1.5">
      <button
        type="button"
        disabled={lock !== null}
        title={lockReason}
        onClick={() => {
          setError('');
          setEditing(true);
        }}
        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {t('actions.edit')}
      </button>

      {canDelete &&
        (confirmDelete ? (
          <>
            <span className="text-[11px] text-red-800">
              {markCount > 0 ? t('actions.deleteConfirmMarks') : t('actions.deleteConfirm')}
            </span>
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
              {t('actions.confirm')}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="rounded-lg border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
          >
            {t('actions.delete')}
          </button>
        ))}

      {error && !editing && <span className="text-[11px] text-red-700">{error}</span>}

      {editing && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4"
          onClick={() => setEditing(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <SessionForm
              {...options}
              initial={session}
              title={t('editSession')}
              submitLabel={t('update')}
              pending={pending}
              error={error}
              onCancel={() => setEditing(false)}
              onSubmit={(fd) => {
                setError('');
                start(async () => {
                  const r = await updateExamSessionAction(session.id, fd);
                  if (!r.ok) return setError(r.error);
                  setEditing(false);
                  router.refresh();
                });
              }}
            />
          </div>
        </div>
      )}
    </div>
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
