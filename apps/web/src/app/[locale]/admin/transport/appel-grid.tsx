'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { saveTransportAppelAction } from './appel-actions';

type Direction = 'MORNING' | 'EVENING';
type Status = 'PRESENT' | 'ABSENT' | 'LATE' | 'NOT_PICKED_UP' | 'BOARDED' | 'DROPPED' | 'INCIDENT';
type Student = { studentId: string; name: string; stopName: string | null; status: Status | null; note: string | null };

const OPTIONS: Record<Direction, Status[]> = {
  MORNING: ['PRESENT', 'LATE', 'ABSENT', 'NOT_PICKED_UP', 'INCIDENT'],
  EVENING: ['BOARDED', 'DROPPED', 'NOT_PICKED_UP', 'INCIDENT'],
};

const STYLE: Record<Status, { on: string; off: string }> = {
  PRESENT: { on: 'bg-emerald-600 text-white border-emerald-600', off: 'text-emerald-700 border-emerald-300' },
  BOARDED: { on: 'bg-emerald-600 text-white border-emerald-600', off: 'text-emerald-700 border-emerald-300' },
  DROPPED: { on: 'bg-emerald-600 text-white border-emerald-600', off: 'text-emerald-700 border-emerald-300' },
  LATE: { on: 'bg-amber-500 text-white border-amber-500', off: 'text-amber-700 border-amber-300' },
  ABSENT: { on: 'bg-red-600 text-white border-red-600', off: 'text-red-700 border-red-300' },
  NOT_PICKED_UP: { on: 'bg-red-600 text-white border-red-600', off: 'text-red-700 border-red-300' },
  INCIDENT: { on: 'bg-purple-600 text-white border-purple-600', off: 'text-purple-700 border-purple-300' },
};

export function AppelGrid({
  lineId,
  date,
  direction,
  students,
}: {
  lineId: string;
  date: string;
  direction: Direction;
  students: Student[];
}) {
  const t = useTranslations('admin.transport.appel');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState<Record<string, { status?: Status; note?: string }>>(() =>
    Object.fromEntries(students.map((s) => [s.studentId, { status: s.status ?? undefined, note: s.note ?? undefined }])),
  );
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const opts = OPTIONS[direction];

  const done = students.filter((s) => state[s.studentId]?.status).length;

  function save() {
    const records = students
      .filter((s) => state[s.studentId]?.status)
      .map((s) => ({ studentId: s.studentId, status: state[s.studentId]!.status!, note: state[s.studentId]?.note }));
    if (records.length === 0) return setMsg({ ok: false, text: t('nothing') });
    setMsg(null);
    start(async () => {
      const r = await saveTransportAppelAction({ lineId, date, direction, records });
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setMsg({ ok: true, text: t('saved') });
      router.refresh();
    });
  }

  if (students.length === 0) {
    return <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">{t('noStudents')}</p>;
  }

  return (
    <div className="space-y-2 pb-20">
      {students.map((s) => {
        const cur = state[s.studentId];
        return (
          <div key={s.studentId} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="font-medium text-slate-800">{s.name}</span>
              {s.stopName && <span className="text-xs text-slate-400">{s.stopName}</span>}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {opts.map((st) => {
                const selected = cur?.status === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setState((p) => ({ ...p, [s.studentId]: { ...p[s.studentId], status: st } }))}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${selected ? STYLE[st].on : `bg-white ${STYLE[st].off}`}`}
                  >
                    {t(`status.${st}`)}
                  </button>
                );
              })}
            </div>
            {cur?.status === 'INCIDENT' && (
              <input
                value={cur.note ?? ''}
                onChange={(e) => setState((p) => ({ ...p, [s.studentId]: { ...p[s.studentId], note: e.target.value } }))}
                placeholder={t('notePlaceholder')}
                className="mt-2 w-full rounded-lg border border-purple-300 px-2 py-1.5 text-sm"
              />
            )}
          </div>
        );
      })}

      {/* Barre d'action fixe */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <span className="text-sm text-slate-500">
            {t('progress', { done, total: students.length })}
            {msg && <span className={`ms-2 ${msg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{msg.text}</span>}
          </span>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {pending ? '…' : t('save')}
          </button>
        </div>
      </div>
    </div>
  );
}
