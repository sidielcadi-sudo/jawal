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
  note: string | null;
};

export type SubjectOpt = { id: string; label: string };
export type TeacherOpt = { id: string; label: string };
export type RoomOpt = { id: string; label: string };

type EditState = {
  day: DayKey;
  slotId: string;
  subjectId: string;
  teacherId: string;
  roomId: string;
  note: string;
};

export function TimetableGrid({
  locale: _locale,
  classId,
  academicYearId,
  days,
  slots,
  entries,
  conflictEntryIds,
  availabilityWarningIds,
  subjects,
  teachers,
  rooms,
}: {
  locale: string;
  classId: string;
  academicYearId: string;
  days: DayKey[];
  slots: GridSlot[];
  entries: GridEntry[];
  conflictEntryIds: Set<string>;
  availabilityWarningIds?: Set<string>;
  subjects: SubjectOpt[];
  teachers: TeacherOpt[];
  rooms: RoomOpt[];
}) {
  const t = useTranslations('admin.timetable');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<EditState | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Index entries par (day, slot) pour lookup O(1)
  const entryByKey = useMemo(() => {
    const m = new Map<string, GridEntry>();
    for (const e of entries) m.set(`${e.dayOfWeek}|${e.slotId}`, e);
    return m;
  }, [entries]);

  const onCellClick = (day: DayKey, slot: GridSlot) => {
    if (slot.isBreak) return;
    const existing = entryByKey.get(`${day}|${slot.id}`);
    setEditing({
      day,
      slotId: slot.id,
      subjectId: existing?.subjectId ?? '',
      teacherId: existing?.teacherId ?? '',
      roomId: existing?.roomId ?? '',
      note: existing?.note ?? '',
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
          <thead className="border-b border-slate-200 bg-[#A9EAFE] text-xs uppercase tracking-wide text-slate-700">
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
                  const e = entryByKey.get(`${d}|${s.id}`);
                  const inConflict = e && conflictEntryIds.has(e.id);
                  const outOfAvailability = e && availabilityWarningIds?.has(e.id);
                  return (
                    <td
                      key={d}
                      className="cursor-pointer px-2 py-2 align-top hover:bg-slate-50"
                      onClick={() => onCellClick(d, s)}
                    >
                      {e ? (
                        <div
                          className={`rounded-lg border p-2 text-[11px] leading-tight ${
                            inConflict
                              ? 'border-red-300 bg-red-50'
                              : outOfAvailability
                                ? 'border-amber-300 bg-amber-50'
                                : 'border-brand-200 bg-brand-50'
                          }`}
                        >
                          <div className="font-semibold text-slate-900">
                            {e.subjectLabel ?? t('untitledCourse')}
                          </div>
                          {e.teacherName && (
                            <div className="mt-0.5 text-slate-600">{e.teacherName}</div>
                          )}
                          {e.roomLabel && (
                            <div className="text-slate-500">📍 {e.roomLabel}</div>
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
                      ) : (
                        <div className="rounded-lg border border-dashed border-slate-200 p-2 text-center text-[10px] text-slate-300 hover:border-brand-300 hover:text-brand-600">
                          + {t('add')}
                        </div>
                      )}
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
