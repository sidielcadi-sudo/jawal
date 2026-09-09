'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { removeTrackCurriculumAction, upsertTrackCurriculumAction } from './actions';

export type TrackCurriculumRow = {
  subjectId: string;
  subjectLabel: string;
  weeklyHours: number;
  ccCoefficient: number;
  /** Coefficient de l'examen certificatif, en lecture seule ici. */
  examCoefficient: number;
};

/**
 * Une ligne du programme d'une filière : horaire et coefficient de contrôle
 * continu, modifiables en place. Le coefficient d'examen est rappelé en gris —
 * il se règle dans « Filières & barèmes », pas ici, parce qu'il obéit au Bac
 * et non à la grille horaire.
 */
export function TrackProgrammeRow({
  trackId,
  row,
}: {
  trackId: string;
  row: TrackCurriculumRow;
}) {
  const t = useTranslations('admin.settings.programme');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [hours, setHours] = useState(String(row.weeklyHours));
  const [cc, setCc] = useState(String(row.ccCoefficient));
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);

  const dirty =
    Number(hours) !== row.weeklyHours || Number(cc) !== row.ccCoefficient;

  function save() {
    setError('');
    const fd = new FormData();
    fd.set('trackId', trackId);
    fd.set('subjectId', row.subjectId);
    fd.set('weeklyHours', hours);
    fd.set('ccCoefficient', cc);
    start(async () => {
      const r = await upsertTrackCurriculumAction(fd);
      if (!r.ok) return setError(r.error);
      router.refresh();
    });
  }

  function remove() {
    setError('');
    start(async () => {
      const r = await removeTrackCurriculumAction(trackId, row.subjectId);
      if (!r.ok) return setError(r.error);
      setConfirm(false);
      router.refresh();
    });
  }

  const input = 'w-20 rounded border border-slate-300 px-2 py-0.5 text-end text-xs tabular-nums';

  return (
    <tr>
      <td className="px-4 py-2 font-medium text-slate-900">{row.subjectLabel}</td>
      <td className="px-4 py-2 text-end">
        <input
          type="number"
          min={0}
          max={40}
          step={0.5}
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          className={input}
        />
        <span className="ms-1 text-[11px] text-slate-400">h</span>
      </td>
      <td className="px-4 py-2 text-end">
        <input
          type="number"
          min={0.5}
          max={20}
          step={0.5}
          value={cc}
          onChange={(e) => setCc(e.target.value)}
          className={input}
        />
      </td>
      <td className="px-4 py-2 text-end text-xs tabular-nums text-slate-400">
        ×{row.examCoefficient}
      </td>
      <td className="px-4 py-2 text-end">
        <div className="flex items-center justify-end gap-1.5">
          {dirty && (
            <button
              type="button"
              disabled={pending}
              onClick={save}
              className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {t('save')}
            </button>
          )}
          {confirm ? (
            <>
              <button
                type="button"
                onClick={() => setConfirm(false)}
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
              onClick={() => setConfirm(true)}
              className="rounded-lg border border-red-300 bg-white px-2 py-1 text-xs text-red-700 hover:bg-red-50"
            >
              {t('remove')}
            </button>
          )}
        </div>
        {error && <p className="mt-1 text-[11px] text-red-700">{error}</p>}
      </td>
    </tr>
  );
}

/** Ajout d'une matière au programme d'une filière. */
export function TrackProgrammeAddRow({
  trackId,
  subjects,
}: {
  trackId: string;
  subjects: { id: string; label: string }[];
}) {
  const t = useTranslations('admin.settings.programme');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? '');
  const [hours, setHours] = useState('2');
  const [cc, setCc] = useState('2');

  function submit() {
    setError('');
    const fd = new FormData();
    fd.set('trackId', trackId);
    fd.set('subjectId', subjectId);
    fd.set('weeklyHours', hours);
    fd.set('ccCoefficient', cc);
    start(async () => {
      const r = await upsertTrackCurriculumAction(fd);
      if (!r.ok) return setError(r.error);
      router.refresh();
    });
  }

  const input = 'rounded-lg border border-slate-300 px-2 py-1.5 text-sm';

  return (
    <div className="space-y-2">
      <select
        value={subjectId}
        onChange={(e) => setSubjectId(e.target.value)}
        className={`${input} w-full`}
      >
        {subjects.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <label className="flex-1 text-xs text-slate-600">
          {t('table.hours')}
          <input
            type="number"
            min={0}
            max={40}
            step={0.5}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className={`${input} mt-1 w-full text-end tabular-nums`}
          />
        </label>
        <label className="flex-1 text-xs text-slate-600">
          {t('table.ccCoefficient')}
          <input
            type="number"
            min={0.5}
            max={20}
            step={0.5}
            value={cc}
            onChange={(e) => setCc(e.target.value)}
            className={`${input} mt-1 w-full text-end tabular-nums`}
          />
        </label>
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
      <button
        type="button"
        disabled={pending || !subjectId}
        onClick={submit}
        className="w-full rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {t('add')}
      </button>
    </div>
  );
}
