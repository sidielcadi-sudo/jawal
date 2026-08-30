'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { StaffAttendanceStatusInput } from '@jawal/shared';
import { computeStaffDeduction } from '@/lib/staff-attendance-deduction';
import { saveStaffAttendanceAction } from './actions';
import { personDisplayName } from '@/lib/localized-name';

export type StaffRow = {
  personId: string;
  firstName: string;
  lastName: string;
  firstNameAr: string | null;
  lastNameAr: string | null;
  type: 'TEACHER' | 'STAFF';
  roleLabelFr: string | null;
  roleLabelAr: string | null;
  grossSalary: number | null;
  status: StaffAttendanceStatusInput;
  lateMinutes: number | null;
  note: string | null;
  deductionAmount: number;
  deductionLocked: boolean;
  hasExisting: boolean;
};

const STATUSES: StaffAttendanceStatusInput[] = [
  'PRESENT',
  'ABSENT',
  'LATE',
  'EXCUSED',
  'LEAVE',
];

const STATUS_STYLES: Record<
  StaffAttendanceStatusInput,
  { active: string; idle: string }
> = {
  PRESENT: {
    active: 'bg-emerald-600 text-white border-emerald-600',
    idle: 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50',
  },
  ABSENT: {
    active: 'bg-red-600 text-white border-red-600',
    idle: 'bg-white text-red-700 border-red-200 hover:bg-red-50',
  },
  LATE: {
    active: 'bg-amber-500 text-white border-amber-500',
    idle: 'bg-white text-amber-700 border-amber-200 hover:bg-amber-50',
  },
  EXCUSED: {
    active: 'bg-blue-600 text-white border-blue-600',
    idle: 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50',
  },
  LEAVE: {
    active: 'bg-slate-600 text-white border-slate-600',
    idle: 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50',
  },
};

export function StaffAttendanceSheet({
  locale,
  date,
  initial,
  backUrl,
}: {
  locale: string;
  date: string;
  initial: StaffRow[];
  backUrl: string;
}) {
  const t = useTranslations('admin.staffAttendance');
  const router = useRouter();
  const [rows, setRows] = useState<StaffRow[]>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isRtl = locale === 'ar';

  const setRow = (personId: string, patch: Partial<StaffRow>) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.personId !== personId) return r;
        const next = { ...r, ...patch };
        if (next.status !== 'LATE') next.lateMinutes = null;
        // Recalcul live si pas verrouillé
        if (!next.deductionLocked) {
          next.deductionAmount = computeStaffDeduction({
            status: next.status,
            grossSalary: next.grossSalary,
            lateMinutes: next.lateMinutes,
          }).amount;
        }
        return next;
      }),
    );
  };

  const allPresent = () => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        status: 'PRESENT' as const,
        lateMinutes: null,
        deductionAmount: r.deductionLocked ? r.deductionAmount : 0,
      })),
    );
  };

  const onSave = () => {
    setError(null);
    const payload = {
      date,
      records: rows.map((r) => ({
        personId: r.personId,
        status: r.status,
        lateMinutes: r.lateMinutes ?? undefined,
        note: r.note ?? undefined,
      })),
    };
    const fd = new FormData();
    fd.append('payload', JSON.stringify(payload));
    startTransition(async () => {
      const res = await saveStaffAttendanceAction(fd);
      if (!res.ok) {
        setError(res.error);
      } else {
        router.refresh();
      }
    });
  };

  const groupedByType = useMemo(() => {
    const t = rows.filter((r) => r.type === 'TEACHER');
    const s = rows.filter((r) => r.type === 'STAFF');
    return { TEACHER: t, STAFF: s };
  }, [rows]);

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        {t('noStaff')}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={allPresent}
          className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
        >
          ✓ {t('markAllPresent')}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? t('saving') : t('save')}
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {(['TEACHER', 'STAFF'] as const).map((group) =>
        groupedByType[group].length === 0 ? null : (
          <section key={group} className="mb-6">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t(`group.${group}`)}
            </h2>
            <ul className="space-y-2">
              {groupedByType[group].map((r) => (
                <li
                  key={r.personId}
                  className="rounded-xl border border-slate-200 bg-white p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-slate-900">
                        {personDisplayName(locale, r)}
                      </div>
                      <div className="text-xs text-slate-500">
                        {isRtl ? r.roleLabelAr ?? '—' : r.roleLabelFr ?? '—'}
                        {r.grossSalary !== null && (
                          <>
                            {' · '}
                            {t('grossPerMonth', { amount: r.grossSalary.toFixed(0) })}
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-end">
                      {r.deductionAmount > 0 ? (
                        <div className="text-sm font-semibold tabular-nums text-red-700">
                          − {r.deductionAmount.toFixed(2)} MAD
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400">—</div>
                      )}
                      {r.hasExisting && (
                        <div className="text-[10px] text-emerald-600">
                          ✓ {t('saved')}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-1">
                    {STATUSES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setRow(r.personId, { status: s })}
                        className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                          r.status === s ? STATUS_STYLES[s].active : STATUS_STYLES[s].idle
                        }`}
                      >
                        {t(`status.${s}`)}
                      </button>
                    ))}
                    {r.status === 'LATE' && (
                      <input
                        type="number"
                        min={0}
                        max={600}
                        placeholder={t('lateMinutesPlaceholder')}
                        value={r.lateMinutes ?? ''}
                        onChange={(e) =>
                          setRow(r.personId, {
                            lateMinutes: e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                        className="w-24 rounded-md border border-slate-300 px-2 py-1 text-xs"
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ),
      )}
    </div>
  );
}
