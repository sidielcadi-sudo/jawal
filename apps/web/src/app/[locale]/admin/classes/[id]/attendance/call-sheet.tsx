'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { AttendanceStatusInput } from '@jawal/shared';
import { reopenSessionAction, saveAttendanceAction } from './actions';

type AttendanceRow = {
  studentId: string;
  firstName: string;
  lastName: string;
  status: AttendanceStatusInput;
  lateMinutes: number | null;
  note: string | null;
};

const STATUSES: AttendanceStatusInput[] = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];

const STATUS_STYLES: Record<string, { active: string; idle: string; label: string }> = {
  PRESENT: {
    active: 'bg-emerald-600 text-white border-emerald-600',
    idle: 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50',
    label: 'present',
  },
  ABSENT: {
    active: 'bg-red-600 text-white border-red-600',
    idle: 'bg-white text-red-700 border-red-200 hover:bg-red-50',
    label: 'absent',
  },
  LATE: {
    active: 'bg-amber-500 text-white border-amber-500',
    idle: 'bg-white text-amber-700 border-amber-200 hover:bg-amber-50',
    label: 'late',
  },
  EXCUSED: {
    active: 'bg-blue-600 text-white border-blue-600',
    idle: 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50',
    label: 'excused',
  },
};

export function AttendanceCallSheet({
  sessionId,
  locale,
  isFinalized: initialFinalized,
  initialRecords,
  backUrl,
}: {
  sessionId: string;
  locale: string;
  isFinalized: boolean;
  initialRecords: AttendanceRow[];
  backUrl: string;
}) {
  const t = useTranslations('admin.attendance');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [records, setRecords] = useState<AttendanceRow[]>(initialRecords);
  const [isFinalized, setIsFinalized] = useState(initialFinalized);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const summary = useMemo(() => {
    const acc = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
    for (const r of records) acc[r.status]++;
    return acc;
  }, [records]);

  function setStatus(studentId: string, status: AttendanceStatusInput) {
    if (isFinalized) return;
    setRecords((rs) =>
      rs.map((r) =>
        r.studentId === studentId
          ? {
              ...r,
              status,
              lateMinutes: status === 'LATE' ? (r.lateMinutes ?? 12) : null,
            }
          : r,
      ),
    );
  }

  function setLateMinutes(studentId: string, minutes: number) {
    setRecords((rs) =>
      rs.map((r) => (r.studentId === studentId ? { ...r, lateMinutes: minutes } : r)),
    );
  }

  function markAllPresent() {
    if (isFinalized) return;
    setRecords((rs) => rs.map((r) => ({ ...r, status: 'PRESENT', lateMinutes: null })));
  }

  function submit(finalize: boolean) {
    setError('');
    const fd = new FormData();
    fd.set(
      'payload',
      JSON.stringify({
        sessionId,
        records: records.map((r) => ({
          studentId: r.studentId,
          status: r.status,
          lateMinutes: r.lateMinutes,
          note: r.note,
        })),
        finalize,
      }),
    );
    startTransition(async () => {
      const result = await saveAttendanceAction(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSavedAt(new Date());
      if (finalize) setIsFinalized(true);
      router.refresh();
    });
  }

  function reopen() {
    setError('');
    startTransition(async () => {
      const result = await reopenSessionAction(sessionId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setIsFinalized(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Bandeau résumé */}
      <div className="grid grid-cols-4 gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-center text-xs">
        <SummaryPill label={t('summary.present')} value={summary.PRESENT} color="emerald" />
        <SummaryPill label={t('summary.absent')} value={summary.ABSENT} color="red" />
        <SummaryPill label={t('summary.late')} value={summary.LATE} color="amber" />
        <SummaryPill label={t('summary.excused')} value={summary.EXCUSED} color="blue" />
      </div>

      {/* Toggle "tout présent" */}
      {!isFinalized && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">{t('hint')}</span>
          <button
            type="button"
            onClick={markAllPresent}
            className="text-xs text-brand-700 hover:underline"
          >
            {t('allPresent')}
          </button>
        </div>
      )}

      {/* Liste élèves */}
      <ul className="space-y-2">
        {records.map((r) => (
          <li
            key={r.studentId}
            className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-900">
                  {r.lastName} {r.firstName}
                </div>
                {r.status === 'LATE' && (
                  <div className="mt-1 flex items-center gap-2 text-xs text-amber-700">
                    <input
                      type="number"
                      min={1}
                      max={600}
                      value={r.lateMinutes ?? 12}
                      onChange={(e) => setLateMinutes(r.studentId, Number(e.target.value))}
                      disabled={isFinalized}
                      className="w-16 rounded border border-amber-300 px-2 py-0.5 text-sm"
                    />
                    <span>{t('minutes')}</span>
                  </div>
                )}
              </div>
              <div className="flex gap-1.5">
                {STATUSES.map((s) => {
                  const styles = STATUS_STYLES[s]!;
                  const active = r.status === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(r.studentId, s)}
                      disabled={isFinalized}
                      className={[
                        'rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                        active ? styles.active : styles.idle,
                      ].join(' ')}
                      title={t(`status.${styles.label}` as never)}
                    >
                      {t(`statusShort.${styles.label}` as never)}
                    </button>
                  );
                })}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* Pied de page actions */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {savedAt && !isFinalized && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          {t('savedAt', { date: savedAt.toLocaleTimeString(locale) })}
        </div>
      )}

      <div className="sticky bottom-0 -mx-4 flex flex-wrap gap-2 border-t border-slate-200 bg-white p-3 sm:relative sm:bottom-auto sm:mx-0 sm:rounded-2xl sm:border sm:p-4">
        <a
          href={backUrl}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          {t('back')}
        </a>
        {isFinalized ? (
          <button
            type="button"
            onClick={reopen}
            disabled={isPending}
            className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
          >
            {isPending ? t('reopening') : t('reopen')}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => submit(false)}
              disabled={isPending}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {isPending ? t('saving') : t('saveDraft')}
            </button>
            <button
              type="button"
              onClick={() => submit(true)}
              disabled={isPending}
              className="ms-auto rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
            >
              {isPending ? t('validating') : t('validate')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryPill({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: 'emerald' | 'red' | 'amber' | 'blue';
}) {
  const styles = {
    emerald: 'text-emerald-700',
    red: 'text-red-700',
    amber: 'text-amber-700',
    blue: 'text-blue-700',
  }[color];
  return (
    <div>
      <div className={`text-2xl font-semibold tabular-nums ${styles}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
