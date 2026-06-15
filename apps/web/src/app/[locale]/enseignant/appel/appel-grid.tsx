'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { AppelRow } from '@/lib/teacher-attendance';
import { categoryOf, type AttendanceCategory } from '@/lib/attendance-category';
import { saveTeacherAppelAction, reopenTeacherAppelAction } from './actions';

type Reason = { id: string; label: string; color: string | null };

// Chaque catégorie est exclusive : sélectionner une colonne fixe l'état complet
// du record (statut de présence + marqueurs). Infirmerie/Punition restent
// « présents » (status PRESENT), Exclusion compte comme absence (status ABSENT).
const CAT_TO_STATE: Record<
  AttendanceCategory,
  Pick<AppelRow, 'status' | 'infirmary' | 'punishment' | 'exclusion'>
> = {
  PRESENT: { status: 'PRESENT', infirmary: false, punishment: false, exclusion: false },
  ABSENT: { status: 'ABSENT', infirmary: false, punishment: false, exclusion: false },
  LATE: { status: 'LATE', infirmary: false, punishment: false, exclusion: false },
  EXCUSED: { status: 'EXCUSED', infirmary: false, punishment: false, exclusion: false },
  INFIRMARY: { status: 'PRESENT', infirmary: true, punishment: false, exclusion: false },
  PUNISHMENT: { status: 'PRESENT', infirmary: false, punishment: true, exclusion: false },
  EXCLUSION: { status: 'ABSENT', infirmary: false, punishment: false, exclusion: true },
};

const REASON_BAR: Record<string, string> = {
  cyan: 'bg-cyan-400',
  rose: 'bg-rose-400',
  blue: 'bg-blue-500',
  amber: 'bg-amber-400',
  green: 'bg-green-500',
  red: 'bg-red-500',
  purple: 'bg-purple-500',
};

export function AppelGrid({
  locale,
  entryId,
  date,
  sessionId,
  isFinalized: initialFinalized,
  className,
  subject,
  room,
  slotStart,
  slotEnd,
  rows: initialRows,
  reasons,
}: {
  locale: string;
  entryId: string;
  date: string;
  sessionId: string | null;
  isFinalized: boolean;
  className: string;
  subject: string | null;
  room: string | null;
  slotStart: string;
  slotEnd: string;
  rows: AppelRow[];
  reasons: Reason[];
}) {
  const t = useTranslations('enseignant.appel');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rows, setRows] = useState<AppelRow[]>(initialRows);
  const [locked, setLocked] = useState(initialFinalized);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [motifFor, setMotifFor] = useState<string | null>(null);
  const [textCell, setTextCell] = useState<{
    studentId: string;
    field: 'observation' | 'encouragement';
  } | null>(null);

  const reasonById = useMemo(() => new Map(reasons.map((r) => [r.id, r])), [reasons]);
  const fmtDate = new Date(`${date}T00:00:00.000Z`).toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

  function setCategory(studentId: string, cat: AttendanceCategory) {
    if (locked) return;
    let openMotif = false;
    setRows((rs) =>
      rs.map((r) => {
        if (r.studentId !== studentId) return r;
        // Re-cliquer la catégorie active la remet à « Présent ».
        const target = categoryOf(r) === cat ? 'PRESENT' : cat;
        const st = CAT_TO_STATE[target];
        if (target === 'LATE' && categoryOf(r) !== 'LATE') openMotif = true;
        return {
          ...r,
          ...st,
          lateMinutes: target === 'LATE' ? (r.lateMinutes ?? 12) : null,
          lateReasonId: target === 'LATE' ? r.lateReasonId : null,
        };
      }),
    );
    if (openMotif) setMotifFor(studentId);
  }

  function setMinutes(studentId: string, minutes: number) {
    setRows((rs) => rs.map((r) => (r.studentId === studentId ? { ...r, lateMinutes: minutes } : r)));
  }

  function setReason(studentId: string, reasonId: string | null) {
    setRows((rs) => rs.map((r) => (r.studentId === studentId ? { ...r, lateReasonId: reasonId } : r)));
    setMotifFor(null);
  }

  // Modale d'édition d'une observation / d'un encouragement.
  function saveTextCell(
    studentId: string,
    field: 'observation' | 'encouragement',
    content: string,
    visible: boolean,
  ) {
    const visField = field === 'observation' ? 'observationVisible' : 'encouragementVisible';
    setRows((rs) =>
      rs.map((r) =>
        r.studentId === studentId
          ? { ...r, [field]: content.trim() ? content : null, [visField]: visible }
          : r,
      ),
    );
    setTextCell(null);
  }

  function submit(finalize: boolean) {
    setError('');
    const fd = new FormData();
    fd.set(
      'payload',
      JSON.stringify({
        entryId,
        date,
        finalize,
        records: rows.map((r) => ({
          studentId: r.studentId,
          status: r.status,
          lateMinutes: r.lateMinutes,
          lateReasonId: r.lateReasonId,
          infirmary: r.infirmary,
          punishment: r.punishment,
          exclusion: r.exclusion,
          note: r.note,
          observation: r.observation,
          observationVisible: r.observationVisible,
          encouragement: r.encouragement,
          encouragementVisible: r.encouragementVisible,
        })),
      }),
    );
    start(async () => {
      const res = await saveTeacherAppelAction(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSavedAt(new Date());
      if (finalize) setLocked(true);
      router.refresh();
    });
  }

  function reopen() {
    if (!sessionId) return;
    setError('');
    start(async () => {
      const res = await reopenTeacherAppelAction(sessionId, entryId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setLocked(false);
      router.refresh();
    });
  }

  const COLS: { cat: AttendanceCategory; label: string; color: keyof typeof BOX_COLOR }[] = [
    { cat: 'ABSENT', label: t('cols.absence'), color: 'red' },
    { cat: 'LATE', label: t('cols.retard'), color: 'amber' },
    { cat: 'INFIRMARY', label: t('cols.infirmerie'), color: 'blue' },
    { cat: 'PUNISHMENT', label: t('cols.punition'), color: 'purple' },
    { cat: 'EXCLUSION', label: t('cols.exclusion'), color: 'rose' },
    { cat: 'EXCUSED', label: t('cols.dispense'), color: 'green' },
  ];

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <h2 className="text-lg font-semibold text-slate-900">
          {className}
          {subject ? <span className="text-slate-500"> · {subject}</span> : null}
        </h2>
        <p className="mt-0.5 text-sm capitalize text-slate-500">
          {fmtDate} · {slotStart}–{slotEnd}
          {room ? ` · ${room}` : ''}
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-500">
              <th className="px-2 py-1.5 text-start">{t('studentsCount', { count: rows.length })}</th>
              {COLS.map((c) => (
                <th key={c.cat} className="px-1 py-1.5 text-center font-medium">
                  {c.label}
                </th>
              ))}
              <th className="min-w-[10rem] border-s border-slate-200 px-2 py-1.5 text-center font-medium">
                {t('cols.observation')}
              </th>
              <th className="min-w-[8rem] px-2 py-1.5 text-center font-medium">
                {t('cols.encouragement')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const cat = categoryOf(r);
              return (
                <tr key={r.studentId} className="hover:bg-slate-50/60">
                  <td className="max-w-[11rem] truncate px-2 py-1 text-[11px] text-slate-700">
                    {r.lastName} {r.firstName}
                  </td>
                  {COLS.map((col) => (
                    <td key={col.cat} className="px-1 py-1 text-center align-top">
                      <Box
                        active={cat === col.cat}
                        color={col.color}
                        disabled={locked}
                        onClick={() => setCategory(r.studentId, col.cat)}
                      />
                      {col.cat === 'LATE' && cat === 'LATE' && (
                        <div className="mt-1 flex items-center justify-center gap-0.5">
                          <input
                            type="number"
                            min={1}
                            max={600}
                            value={r.lateMinutes ?? 12}
                            onChange={(e) => setMinutes(r.studentId, Number(e.target.value))}
                            disabled={locked}
                            className="w-9 rounded border border-amber-300 px-0.5 py-0.5 text-center text-[10px]"
                          />
                          <button
                            type="button"
                            disabled={locked}
                            onClick={() => setMotifFor(r.studentId)}
                            className="max-w-[5rem] truncate rounded border border-slate-300 bg-white px-1 py-0.5 text-[9px] text-slate-600 hover:bg-slate-50"
                            title={r.lateReasonId ? reasonById.get(r.lateReasonId)?.label : t('motifUnknown')}
                          >
                            {r.lateReasonId
                              ? reasonById.get(r.lateReasonId)?.label ?? t('motif')
                              : t('motifUnknown')}
                          </button>
                        </div>
                      )}
                    </td>
                  ))}
                  <td className="border-s border-slate-100 px-2 py-1 align-top">
                    <TextCellButton
                      value={r.observation}
                      disabled={locked}
                      onClick={() => setTextCell({ studentId: r.studentId, field: 'observation' })}
                      label={t('addObservation')}
                    />
                  </td>
                  <td className="px-2 py-1 align-top">
                    <TextCellButton
                      value={r.encouragement}
                      disabled={locked}
                      onClick={() => setTextCell({ studentId: r.studentId, field: 'encouragement' })}
                      label={t('addEncouragement')}
                    />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-slate-500">
                  {t('noStudents')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      {savedAt && !locked && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          {t('savedAt', { time: savedAt.toLocaleTimeString(locale) })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {locked ? (
          <>
            <span className="text-sm text-slate-500">{t('lockedHint')}</span>
            <button
              type="button"
              onClick={reopen}
              disabled={pending}
              className="ms-auto rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
            >
              {pending ? t('reopening') : t('reopen')}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => submit(false)}
              disabled={pending}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {pending ? t('saving') : t('save')}
            </button>
            <button
              type="button"
              onClick={() => submit(true)}
              disabled={pending}
              className="ms-auto rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
            >
              {pending ? t('validating') : t('validate')}
            </button>
          </>
        )}
      </div>

      {/* Modale motifs de retard */}
      {motifFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setMotifFor(null)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-5 py-3 text-center text-base font-semibold text-slate-800">
              {t('motifTitle')}
            </div>
            <ul className="max-h-[60vh] overflow-y-auto">
              <li>
                <button
                  type="button"
                  onClick={() => setReason(motifFor, null)}
                  className="w-full border-b border-slate-100 px-5 py-3 text-start text-sm text-slate-600 hover:bg-slate-50"
                >
                  {t('motifUnknown')}
                </button>
              </li>
              {reasons.map((reason) => (
                <li key={reason.id}>
                  <button
                    type="button"
                    onClick={() => setReason(motifFor, reason.id)}
                    className="flex w-full items-center gap-3 border-b border-slate-100 px-5 py-3 text-start text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <span className={`h-5 w-1.5 rounded ${REASON_BAR[reason.color ?? ''] ?? 'bg-slate-300'}`} />
                    {reason.label}
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex justify-end border-t border-slate-200 px-5 py-3">
              <button
                type="button"
                onClick={() => setMotifFor(null)}
                className="rounded-full border border-slate-300 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale : observation / encouragement aux parents */}
      {textCell &&
        (() => {
          const row = rows.find((r) => r.studentId === textCell.studentId);
          if (!row) return null;
          const isObs = textCell.field === 'observation';
          return (
            <TextCellModal
              title={isObs ? t('cols.observation') : t('cols.encouragement')}
              initialText={(isObs ? row.observation : row.encouragement) ?? ''}
              initialVisible={isObs ? row.observationVisible : row.encouragementVisible}
              publishLabel={t('publishToParents')}
              cancelLabel={t('cancel')}
              saveLabel={t('validate')}
              onClose={() => setTextCell(null)}
              onSave={(text, visible) => saveTextCell(textCell.studentId, textCell.field, text, visible)}
            />
          );
        })()}
    </div>
  );
}

/** Cellule cliquable : montre un indicateur si du texte est saisi. */
function TextCellButton({
  value,
  disabled,
  onClick,
  label,
}: {
  value: string | null;
  disabled: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={value ?? label}
      className={`block w-full truncate rounded border px-1.5 py-1 text-start text-[10px] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        value
          ? 'border-emerald-200 bg-emerald-50 text-slate-700 hover:bg-emerald-100'
          : 'border-dashed border-slate-300 text-slate-400 hover:bg-slate-50'
      }`}
    >
      {value ? value : `＋ ${label}`}
    </button>
  );
}

function TextCellModal({
  title,
  initialText,
  initialVisible,
  publishLabel,
  cancelLabel,
  saveLabel,
  onClose,
  onSave,
}: {
  title: string;
  initialText: string;
  initialVisible: boolean;
  publishLabel: string;
  cancelLabel: string;
  saveLabel: string;
  onClose: () => void;
  onSave: (text: string, visible: boolean) => void;
}) {
  const [text, setText] = useState(initialText);
  const [visible, setVisible] = useState(initialVisible);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-base font-semibold text-slate-900">{title}</h3>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          autoFocus
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
          {publishLabel}
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => onSave(text, visible)}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const BOX_COLOR: Record<string, string> = {
  red: 'border-red-500 bg-red-500',
  amber: 'border-amber-500 bg-amber-500',
  blue: 'border-blue-500 bg-blue-500',
  purple: 'border-purple-500 bg-purple-500',
  rose: 'border-rose-500 bg-rose-500',
  green: 'border-green-600 bg-green-600',
};

/** Case à cocher colorée (✓ quand active). */
function Box({
  active,
  color,
  disabled,
  onClick,
}: {
  active: boolean;
  color: keyof typeof BOX_COLOR;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-5 w-5 items-center justify-center rounded border text-xs text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        active ? BOX_COLOR[color] : 'border-slate-300 bg-white hover:border-slate-400'
      }`}
    >
      {active ? '✓' : ''}
    </button>
  );
}
