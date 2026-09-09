'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { DayKey } from '@/lib/timetable-conflicts';
import { upsertTimetableEntryAction } from './actions';

export type GridSlot = {
  id: string;
  startTime: string;
  endTime: string;
  label: string | null;
  isBreak: boolean;
};

export type GridEntry = {
  id: string;
  dayOfWeek: DayKey;
  slotId: string;
  subjectId: string | null;
  subjectLabel: string | null;
  teacherId: string | null;
  teacherName: string | null;
  roomId: string | null;
  roomLabel: string | null;
  /** Groupe visé. Null = la classe entière. */
  groupId: string | null;
  groupName: string | null;
  note: string | null;
};

export type SubjectOpt = { id: string; label: string };
/** Groupe de la classe, proposé à la case selon la matière choisie. */
export type GroupOpt = { id: string; label: string; subjectId: string | null; size: number };
export type TeacherOpt = { id: string; label: string };
export type RoomOpt = { id: string; label: string };

type EditState = {
  day: DayKey;
  slotId: string;
  subjectId: string;
  teacherId: string;
  roomId: string;
  /** '' = classe entière. */
  groupId: string;
  note: string;
  /** Séance en cours de modification, s'il y en a une. */
  entryId: string | null;
};

export type CellOverride = { kind: 'CANCELLED' | 'SUBSTITUTION'; label: string };

export function TimetableGrid({
  locale: _locale,
  classId,
  academicYearId,
  days,
  slots,
  entries,
  conflictEntryIds,
  availabilityWarningIds,
  approvedOverrides,
  subjects,
  teachers,
  rooms,
  groups,
}: {
  locale: string;
  classId: string;
  academicYearId: string;
  days: DayKey[];
  slots: GridSlot[];
  entries: GridEntry[];
  conflictEntryIds: Set<string>;
  availabilityWarningIds?: Set<string>;
  /** Override APPROUVÉ à venir par entryId (remplacement / annulation). */
  approvedOverrides?: Record<string, CellOverride>;
  subjects: SubjectOpt[];
  teachers: TeacherOpt[];
  rooms: RoomOpt[];
  /** Groupes de la classe, toutes matières confondues. */
  groups: GroupOpt[];
}) {
  const t = useTranslations('admin.timetable');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<EditState | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Séances par (jour, créneau) — une LISTE, pas une séance unique.
   *
   * Le dédoublement autorise plusieurs séances simultanées sur une même case
   * dès qu'elles visent des groupes distincts. L'index précédent n'en gardait
   * qu'une : la seconde existait en base sans jamais s'afficher.
   */
  const entriesByKey = useMemo(() => {
    const m = new Map<string, GridEntry[]>();
    for (const e of entries) {
      const k = `${e.dayOfWeek}|${e.slotId}`;
      const arr = m.get(k) ?? [];
      arr.push(e);
      m.set(k, arr);
    }
    // Classe entière d'abord, puis les groupes par nom : l'ordre d'affichage
    // ne doit pas dépendre de l'ordre de création.
    for (const arr of m.values()) {
      arr.sort((a, b) =>
        a.groupId === b.groupId
          ? 0
          : a.groupId === null
            ? -1
            : b.groupId === null
              ? 1
              : (a.groupName ?? '').localeCompare(b.groupName ?? ''),
      );
    }
    return m;
  }, [entries]);

  /** Ouvre l'édition d'une séance existante, ou d'une nouvelle sur la case. */
  const openEditor = (day: DayKey, slot: GridSlot, existing?: GridEntry) => {
    if (slot.isBreak) return;
    setEditing({
      day,
      slotId: slot.id,
      subjectId: existing?.subjectId ?? '',
      teacherId: existing?.teacherId ?? '',
      roomId: existing?.roomId ?? '',
      groupId: existing?.groupId ?? '',
      note: existing?.note ?? '',
      entryId: existing?.id ?? null,
    });
    setError(null);
  };

  const onSubmit = () => {
    if (!editing) return;
    setError(null);
    const payload = {
      academicYearId,
      classId,
      slotId: editing.slotId,
      dayOfWeek: editing.day,
      subjectId: editing.subjectId || undefined,
      teacherId: editing.teacherId || undefined,
      roomId: editing.roomId || undefined,
      groupId: editing.groupId || undefined,
      note: editing.note || undefined,
    };
    const fd = new FormData();
    fd.append('payload', JSON.stringify(payload));
    startTransition(async () => {
      const res = await upsertTimetableEntryAction(fd);
      if (!res.ok) {
        setError(res.error);
      } else {
        setEditing(null);
        router.refresh();
      }
    });
  };

  const onClear = () => {
    if (!editing) return;
    setEditing({ ...editing, subjectId: '', teacherId: '', roomId: '', note: '' });
  };

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
            <tr>
              <th className="px-3 py-3 text-start">{t('slot')}</th>
              {days.map((d) => (
                <th key={d} className="px-3 py-3 text-start">
                  {t(`days.${d}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {slots.map((s) => (
              <tr key={s.id} className={s.isBreak ? 'bg-amber-50/30' : ''}>
                <th className="w-32 px-3 py-2 text-start align-top">
                  <div className="font-medium tabular-nums text-slate-900">
                    {s.startTime}
                  </div>
                  <div className="text-[10px] text-slate-400">{s.endTime}</div>
                  {s.label && <div className="text-[10px] text-amber-700">{s.label}</div>}
                </th>
                {days.map((d) => {
                  if (s.isBreak) {
                    return (
                      <td key={d} className="px-3 py-2 text-center text-[10px] uppercase text-amber-700">
                        {s.label ?? t('break')}
                      </td>
                    );
                  }
                  const cell = entriesByKey.get(`${d}|${s.id}`) ?? [];
                  const split = cell.length > 1 || cell.some((x) => x.groupId);
                  return (
                    <td key={d} className="px-2 py-2 align-top">
                      <div className="space-y-1">
                      {cell.map((e) => {
                      const inConflict = conflictEntryIds.has(e.id);
                      const outOfAvailability = availabilityWarningIds?.has(e.id);
                      const ov = approvedOverrides?.[e.id];
                      const cancelled = ov?.kind === 'CANCELLED';
                      return (
                        <div
                          key={e.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => openEditor(d, s, e)}
                          onKeyDown={(ev) => ev.key === 'Enter' && openEditor(d, s, e)}
                          className={`cursor-pointer rounded-lg border p-2 text-[11px] leading-tight hover:brightness-95 ${
                            cancelled
                              ? 'border-red-300 bg-red-50'
                              : ov
                                ? 'border-amber-300 bg-amber-50'
                                : inConflict
                                  ? 'border-red-300 bg-red-50'
                                  : outOfAvailability
                                    ? 'border-amber-300 bg-amber-50'
                                    : 'border-brand-200 bg-brand-50'
                          }`}
                        >
                          <div className={`font-semibold ${cancelled ? 'text-red-700 line-through' : 'text-slate-900'}`}>
                            {e.subjectLabel ?? t('untitledCourse')}
                          </div>
                          {/* Le groupe se lit AVANT le prof : c'est lui qui dit
                              quels élèves sont concernés. */}
                          {e.groupName && (
                            <div className="mt-0.5 inline-block rounded bg-indigo-100 px-1 py-0.5 text-[10px] font-semibold text-indigo-800">
                              {e.groupName}
                            </div>
                          )}
                          {e.teacherName && (
                            <div className={`mt-0.5 ${cancelled ? 'text-red-400 line-through' : 'text-slate-600'}`}>{e.teacherName}</div>
                          )}
                          {e.roomLabel && (
                            <div className={cancelled ? 'text-red-300' : 'text-slate-500'}>📍 {e.roomLabel}</div>
                          )}
                          {ov && (
                            <div
                              className={`mt-1 rounded px-1 py-0.5 text-[10px] font-semibold ${
                                cancelled ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {ov.label}
                            </div>
                          )}
                          {inConflict && (
                            <div className="mt-1 text-[10px] font-semibold text-red-700">
                              ⚠ {t('conflictBadge')}
                            </div>
                          )}
                          {outOfAvailability && !inConflict && (
                            <div className="mt-1 text-[10px] font-semibold text-amber-700">
                              ⏱ {t('outOfAvailabilityBadge')}
                            </div>
                          )}
                        </div>
                      );
                      })}

                      {/* Ajouter : toujours proposé quand la case est vide, et
                          aussi sous un dédoublement — c'est là qu'on ajoute le
                          groupe suivant. Jamais sous une séance en classe
                          entière : le serveur la refuserait. */}
                      {(cell.length === 0 || split) && (
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => openEditor(d, s)}
                          onKeyDown={(ev) => ev.key === 'Enter' && openEditor(d, s)}
                          className="cursor-pointer rounded-lg border border-dashed border-slate-200 p-1.5 text-center text-[10px] text-slate-300 hover:border-brand-300 hover:text-brand-600"
                        >
                          + {cell.length === 0 ? t('add') : t('addGroup')}
                        </div>
                      )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal édition */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setEditing(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold text-slate-700">
              {t('editTitle', {
                day: t(`days.${editing.day}`),
                slot:
                  slots.find((s) => s.id === editing.slotId)?.startTime ?? '',
              })}
            </h2>

            <div className="mt-4 space-y-3">
              <Field label={t('subject')}>
                <select
                  value={editing.subjectId}
                  onChange={(e) => setEditing({ ...editing, subjectId: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">{t('none')}</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>
              {/* Groupe : filtré par la matière choisie, plus les groupes
                  polyvalents. Sans matière, on montre tout — l'agent choisit
                  souvent le groupe après la matière, mais pas toujours. */}
              {groups.length > 0 && (
                <Field label={t('group')}>
                  <select
                    value={editing.groupId}
                    onChange={(e) => setEditing({ ...editing, groupId: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">{t('wholeClass')}</option>
                    {groups
                      .filter(
                        (g) =>
                          g.subjectId === null ||
                          !editing.subjectId ||
                          g.subjectId === editing.subjectId,
                      )
                      .map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.label} ({g.size})
                        </option>
                      ))}
                  </select>
                </Field>
              )}
              <Field label={t('teacher')}>
                <select
                  value={editing.teacherId}
                  onChange={(e) => setEditing({ ...editing, teacherId: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">{t('none')}</option>
                  {teachers.map((tt) => (
                    <option key={tt.id} value={tt.id}>
                      {tt.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('room')}>
                <select
                  value={editing.roomId}
                  onChange={(e) => setEditing({ ...editing, roomId: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">{t('none')}</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('note')}>
                <input
                  type="text"
                  value={editing.note}
                  onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder={t('notePlaceholder')}
                />
              </Field>
            </div>

            {error && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                {error}
              </div>
            )}

            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={onClear}
                className="text-xs text-red-600 hover:underline"
              >
                {t('clearCell')}
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-sm hover:bg-slate-50"
                >
                  {t('cancel')}
                </button>
                <button
                  type="button"
                  onClick={onSubmit}
                  disabled={pending}
                  className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {pending ? t('saving') : t('save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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
