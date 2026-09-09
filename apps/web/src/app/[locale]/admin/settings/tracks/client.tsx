'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  importMoroccoPresetAction,
  saveGradingRuleAction,
  saveTrackCoefficientsAction,
  saveTrackBlueprintsAction,
  toggleGradingRuleLockAction,
} from './actions';

export type SubjectOpt = { id: string; label: string };

export type TrackRow = {
  id: string;
  label: string;
  code: string;
  levelId: string;
  coefficients: { subjectId: string; coefficient: number; certifying: boolean }[];
  /** Maquette d'épreuve du Bac : durée, type, groupe de sujet partagé. */
  blueprints: {
    subjectId: string;
    durationMin: number;
    type: 'SPECIALITY' | 'SECONDARY' | 'LITERARY';
    paperGroup: string | null;
  }[];
};

export type LevelRow = {
  id: string;
  label: string;
  cycleLabel: string;
  tracks: TrackRow[];
  rule: {
    id: string | null;
    cc: number;
    semester: number;
    regional: number;
    national: number;
    locked: boolean;
  };
};

/** Import du référentiel officiel — idempotent, relançable. */
export function ImportPresetButton() {
  const t = useTranslations('admin.settings.tracks');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState('');
  const [confirming, setConfirming] = useState(false);

  function run() {
    setMsg('');
    start(async () => {
      const r = await importMoroccoPresetAction();
      if (!r.ok) return setMsg(r.error);
      setConfirming(false);
      setMsg(
        t('import.done', {
          tracks: r.data?.tracks ?? 0,
          coefficients: r.data?.coefficients ?? 0,
          subjects: r.data?.subjects ?? 0,
        }),
      );
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-brand-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">{t('import.title')}</h2>
      <p className="mt-1 text-xs text-slate-500">{t('import.hint')}</p>
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          {t('import.action')}
        </button>
      ) : (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs text-amber-900">{t('import.confirm')}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={run}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {pending ? t('import.running') : t('import.confirmAction')}
            </button>
          </div>
        </div>
      )}
      {msg && <p className="mt-2 text-xs text-slate-600">{msg}</p>}
    </div>
  );
}

/** Barème CC / semestriel / régional / national d'un niveau. */
export function GradingRuleForm({
  academicYearId,
  level,
}: {
  academicYearId: string;
  level: LevelRow;
}) {
  const t = useTranslations('admin.settings.tracks');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [w, setW] = useState({
    cc: String(level.rule.cc),
    semester: String(level.rule.semester),
    regional: String(level.rule.regional),
    national: String(level.rule.national),
  });
  const [msg, setMsg] = useState('');

  const total =
    Number(w.cc || 0) + Number(w.semester || 0) + Number(w.regional || 0) + Number(w.national || 0);
  const valid = Math.abs(total - 100) < 0.01;

  function save() {
    setMsg('');
    start(async () => {
      const r = await saveGradingRuleAction(academicYearId, level.id, null, {
        cc: Number(w.cc || 0),
        semester: Number(w.semester || 0),
        regional: Number(w.regional || 0),
        national: Number(w.national || 0),
      });
      if (!r.ok) return setMsg(r.error);
      setMsg(t('saved'));
      router.refresh();
    });
  }

  function toggleLock() {
    if (!level.rule.id) return;
    start(async () => {
      const r = await toggleGradingRuleLockAction(level.rule.id!, !level.rule.locked);
      if (!r.ok) return setMsg(r.error);
      router.refresh();
    });
  }

  const field = (key: keyof typeof w, label: string) => (
    <label className="flex items-center gap-1.5 text-xs text-slate-600">
      {label}
      <input
        type="number"
        min={0}
        max={100}
        disabled={level.rule.locked}
        value={w[key]}
        onChange={(e) => setW((cur) => ({ ...cur, [key]: e.target.value }))}
        className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-sm tabular-nums disabled:bg-slate-100"
      />
      %
    </label>
  );

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
      {field('cc', t('weights.cc'))}
      {field('semester', t('weights.semester'))}
      {field('regional', t('weights.regional'))}
      {field('national', t('weights.national'))}
      <span
        className={`text-xs font-semibold tabular-nums ${valid ? 'text-emerald-700' : 'text-red-700'}`}
      >
        = {total}%
      </span>
      <button
        type="button"
        disabled={pending || !valid || level.rule.locked}
        onClick={save}
        className="rounded-lg bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-40"
      >
        {t('save')}
      </button>
      {level.rule.id && (
        <button
          type="button"
          disabled={pending}
          onClick={toggleLock}
          className={`rounded-lg border px-3 py-1 text-xs font-medium ${
            level.rule.locked
              ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          {level.rule.locked ? `🔒 ${t('unlock')}` : `🔓 ${t('lock')}`}
        </button>
      )}
      {msg && <span className="text-xs text-slate-500">{msg}</span>}
    </div>
  );
}

/**
 * Grille d'une filière : coefficient **et** maquette d'épreuve (durée, type,
 * groupe de sujet partagé), matière par matière.
 *
 * Le groupe de sujet est la donnée qui commande l'organisation : deux filières
 * portant le même code sur la même matière ne donneront qu'**une** épreuve à
 * planifier. Laisser le champ vide isole la filière, même à durée identique —
 * c'est le cas de SVT en SMA/SMB/SP.
 */
export function TrackCoefficients({
  track,
  subjects,
}: {
  track: TrackRow;
  subjects: SubjectOpt[];
}) {
  const t = useTranslations('admin.settings.tracks');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState('');
  const [rows, setRows] = useState(() => {
    const coefById = new Map(track.coefficients.map((c) => [c.subjectId, c]));
    const bpById = new Map(track.blueprints.map((b) => [b.subjectId, b]));
    return subjects.map((s) => {
      const bp = bpById.get(s.id);
      return {
        subjectId: s.id,
        label: s.label,
        coefficient: String(coefById.get(s.id)?.coefficient ?? 0),
        certifying: coefById.get(s.id)?.certifying ?? false,
        durationMin: String(bp?.durationMin ?? 0),
        type: (bp?.type ?? 'SECONDARY') as 'SPECIALITY' | 'SECONDARY' | 'LITERARY',
        paperGroup: bp?.paperGroup ?? '',
      };
    });
  });

  const active = rows.filter((r) => Number(r.coefficient) > 0);
  const totalCoef = active.reduce((s, r) => s + Number(r.coefficient), 0);
  const examCount = rows.filter((r) => Number(r.durationMin) > 0).length;

  function save() {
    setMsg('');
    start(async () => {
      const coefs = await saveTrackCoefficientsAction(
        track.id,
        rows.map((x) => ({
          subjectId: x.subjectId,
          coefficient: Number(x.coefficient || 0),
          certifying: x.certifying,
        })),
      );
      if (!coefs.ok) return setMsg(coefs.error);
      const bps = await saveTrackBlueprintsAction(
        track.id,
        rows.map((x) => ({
          subjectId: x.subjectId,
          durationMin: Number(x.durationMin || 0),
          type: x.type,
          paperGroup: x.paperGroup,
        })),
      );
      if (!bps.ok) return setMsg(bps.error);
      setMsg(t('saved'));
      router.refresh();
    });
  }

  const patch = (i: number, p: Partial<(typeof rows)[number]>) =>
    setRows((cur) => cur.map((x, j) => (j === i ? { ...x, ...p } : x)));

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-start"
      >
        <span className="text-sm font-medium text-slate-900">{track.label}</span>
        <span className="flex items-center gap-2 text-xs text-slate-500">
          {t('subjectCount', { count: active.length })} · Σ {totalCoef} ·{' '}
          {t('examCount', { count: examCount })}
          <span className="text-slate-400">{open ? '▲' : '▼'}</span>
        </span>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-3 py-2">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-1 text-start">{t('subject')}</th>
                  <th className="py-1 text-end">{t('coefficient')}</th>
                  <th className="py-1 text-center">{t('certifying')}</th>
                  <th className="py-1 text-end">{t('examDuration')}</th>
                  <th className="py-1 text-start">{t('examType')}</th>
                  <th className="py-1 text-start">{t('paperGroup')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, i) => {
                  const inExam = Number(r.durationMin) > 0;
                  return (
                    <tr key={r.subjectId} className={Number(r.coefficient) > 0 ? '' : 'opacity-45'}>
                      <td className="py-1 text-slate-800">{r.label}</td>
                      <td className="py-1 text-end">
                        <input
                          type="number"
                          min={0}
                          max={20}
                          step={0.5}
                          value={r.coefficient}
                          onChange={(e) => patch(i, { coefficient: e.target.value })}
                          className="w-16 rounded border border-slate-300 px-2 py-0.5 text-end tabular-nums"
                        />
                      </td>
                      <td className="py-1 text-center">
                        <input
                          type="checkbox"
                          checked={r.certifying}
                          disabled={Number(r.coefficient) <= 0}
                          onChange={(e) => patch(i, { certifying: e.target.checked })}
                        />
                      </td>
                      <td className="py-1 text-end">
                        {/* Durée en minutes : 0 = matière non évaluée à l'examen. */}
                        <input
                          type="number"
                          min={0}
                          max={480}
                          step={15}
                          value={r.durationMin}
                          onChange={(e) => patch(i, { durationMin: e.target.value })}
                          className="w-20 rounded border border-slate-300 px-2 py-0.5 text-end tabular-nums"
                        />
                        {inExam && (
                          <span className="ms-1 text-[10px] text-slate-400">
                            {fmtDuration(Number(r.durationMin))}
                          </span>
                        )}
                      </td>
                      <td className="py-1">
                        <select
                          value={r.type}
                          disabled={!inExam}
                          onChange={(e) =>
                            patch(i, { type: e.target.value as (typeof rows)[number]['type'] })
                          }
                          className="rounded border border-slate-300 px-1.5 py-0.5 text-xs disabled:bg-slate-100"
                        >
                          <option value="SPECIALITY">{t('types.SPECIALITY')}</option>
                          <option value="SECONDARY">{t('types.SECONDARY')}</option>
                          <option value="LITERARY">{t('types.LITERARY')}</option>
                        </select>
                      </td>
                      <td className="py-1">
                        <input
                          type="text"
                          value={r.paperGroup}
                          disabled={!inExam}
                          placeholder={t('ownPaper')}
                          onChange={(e) => patch(i, { paperGroup: e.target.value })}
                          className="w-36 rounded border border-slate-300 px-2 py-0.5 text-xs disabled:bg-slate-100"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">{t('zeroHint')}</p>
          <p className="mt-1 text-[11px] text-slate-500">{t('groupHint')}</p>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={save}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {t('save')}
            </button>
            {msg && <span className="text-xs text-slate-500">{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}


/** 240 → « 4h », 150 → « 2h30 ». */
function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}
