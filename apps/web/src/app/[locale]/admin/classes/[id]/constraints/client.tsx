'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ClassDayKey, ClassTimetableConstraints } from '@jawal/shared';
import {
  resetClassTimetableConstraintsAction,
  upsertClassTimetableConstraintsAction,
} from './actions';

const DAY_KEYS: ClassDayKey[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

type SlotRow = {
  id: string;
  startTime: string;
  endTime: string;
  label: string | null;
  isBreak: boolean;
};

export function ConstraintsForm({
  classId,
  locale: _locale,
  initial,
  slots,
}: {
  classId: string;
  locale: string;
  initial: ClassTimetableConstraints;
  slots: SlotRow[];
}) {
  const t = useTranslations('admin.classConstraints');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const placeableSlots = slots.filter((s) => !s.isBreak);

  // Index initial des forbiddenSlots pour pré-cocher
  const initiallyForbidden = new Set<string>(
    initial.forbiddenSlots.map((f) => `${f.day}|${f.slotId}`),
  );
  const forbiddenDaysSet = new Set<ClassDayKey>(initial.forbiddenDays);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await upsertClassTimetableConstraintsAction(classId, fd);
      if (!res.ok) {
        setError(res.error);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        router.refresh();
      }
    });
  };

  const onReset = () => {
    if (!confirm(t('confirmReset'))) return;
    startTransition(async () => {
      await resetClassTimetableConstraintsAction(classId);
      router.refresh();
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* Max / Min h/jour */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-700">{t('hours.title')}</h2>
        <p className="mt-1 text-xs text-slate-500">{t('hours.hint')}</p>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
              {t('hours.max')}
            </span>
            <input
              type="number"
              name="maxHoursPerDay"
              min={1}
              max={12}
              defaultValue={initial.maxHoursPerDay ?? ''}
              placeholder={t('hours.inherit')}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
            <span className="mt-1 block text-xs text-slate-500">{t('hours.maxHint')}</span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
              {t('hours.min')}
            </span>
            <input
              type="number"
              name="minHoursPerDay"
              min={1}
              max={12}
              defaultValue={initial.minHoursPerDay ?? ''}
              placeholder={t('hours.inherit')}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
            <span className="mt-1 block text-xs text-slate-500">{t('hours.minHint')}</span>
          </label>
        </div>
      </section>

      {/* Jours OFF additionnels */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-700">{t('forbiddenDays.title')}</h2>
        <p className="mt-1 text-xs text-slate-500">{t('forbiddenDays.hint')}</p>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {DAY_KEYS.map((d) => (
            <label
              key={d}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              <input
                type="checkbox"
                name={`forbiddenDay_${d}`}
                defaultChecked={forbiddenDaysSet.has(d)}
                className="h-4 w-4"
              />
              <span>{t(`days.${d}`)}</span>
            </label>
          ))}
        </div>
      </section>

      {/* Plages horaires interdites */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-700">{t('forbiddenSlots.title')}</h2>
        <p className="mt-1 text-xs text-slate-500">{t('forbiddenSlots.hint')}</p>

        {placeableSlots.length === 0 ? (
          <p className="mt-3 text-xs text-amber-700">{t('forbiddenSlots.noSlots')}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-slate-200 table-head text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-2 py-2 text-start">{t('forbiddenSlots.slot')}</th>
                  {DAY_KEYS.slice(0, 6).map((d) => (
                    <th key={d} className="px-2 py-2 text-center">
                      {t(`days.${d}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {placeableSlots.map((s) => (
                  <tr key={s.id}>
                    <td className="px-2 py-1.5">
                      <span className="font-medium tabular-nums">{s.startTime}</span>
                      <span className="ms-1 text-[10px] text-slate-400">{s.endTime}</span>
                    </td>
                    {DAY_KEYS.slice(0, 6).map((d) => (
                      <td key={d} className="px-2 py-1.5 text-center">
                        <input
                          type="checkbox"
                          name={`forbiddenSlot_${d}`}
                          value={s.id}
                          defaultChecked={initiallyForbidden.has(`${d}|${s.id}`)}
                          className="h-4 w-4"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        {saved && <span className="text-xs text-emerald-700">✓ {t('saved')}</span>}
        <button
          type="button"
          onClick={onReset}
          disabled={pending}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {t('reset')}
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? t('saving') : t('save')}
        </button>
      </div>
    </form>
  );
}
