'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { DayKey, DayMode, TimetableSettings } from '@jawal/shared';
import {
  resetCycleTimetableSettingsAction,
  upsertCycleTimetableSettingsAction,
  upsertTimetableSettingsAction,
} from './actions';

const DAY_KEYS: DayKey[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const MODES: DayMode[] = ['FULL', 'MORNING_ONLY', 'AFTERNOON_ONLY', 'OFF'];

export type CycleRow = {
  id: string;
  code: string;
  label: string;
  hasOverride: boolean;
  settings: TimetableSettings;
};

export function SettingsManager({
  locale,
  tenantSettings,
  cycles,
}: {
  locale: string;
  tenantSettings: TimetableSettings;
  cycles: CycleRow[];
}) {
  const t = useTranslations('admin.timetableSettings');

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-slate-900">{t('tenantLevel.title')}</h2>
          <p className="text-xs text-slate-500">{t('tenantLevel.subtitle')}</p>
        </div>
        <SettingsForm
          locale={locale}
          initial={tenantSettings}
          context={{ kind: 'tenant' }}
        />
      </section>

      {cycles.length > 0 && (
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-base font-semibold text-slate-900">{t('cycleLevel.title')}</h2>
            <p className="text-xs text-slate-500">{t('cycleLevel.subtitle')}</p>
          </div>
          <div className="space-y-4">
            {cycles.map((c) => (
              <CycleCard key={c.id} locale={locale} cycle={c} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function CycleCard({ locale, cycle }: { locale: string; cycle: CycleRow }) {
  const t = useTranslations('admin.timetableSettings');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(cycle.hasOverride);

  const onReset = () => {
    if (!confirm(t('cycleLevel.confirmReset', { cycle: cycle.label }))) return;
    startTransition(async () => {
      await resetCycleTimetableSettingsAction(cycle.id);
      router.refresh();
    });
  };

  return (
    <div
      className={`rounded-2xl border ${
        cycle.hasOverride
          ? 'border-brand-300 bg-brand-50/40'
          : 'border-slate-200 bg-white'
      } p-5`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{cycle.label}</h3>
          <p className="text-xs text-slate-500">
            {cycle.hasOverride
              ? t('cycleLevel.statusOverride')
              : t('cycleLevel.statusInherit')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {cycle.hasOverride && (
            <button
              type="button"
              onClick={onReset}
              disabled={pending}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {t('cycleLevel.resetButton')}
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
          >
            {expanded
              ? t('cycleLevel.collapseButton')
              : cycle.hasOverride
                ? t('cycleLevel.editButton')
                : t('cycleLevel.customizeButton')}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="mt-5">
          <SettingsForm
            locale={locale}
            initial={cycle.settings}
            context={{ kind: 'cycle', cycleId: cycle.id }}
          />
        </div>
      )}
    </div>
  );
}

function SettingsForm({
  locale: _locale,
  initial,
  context,
}: {
  locale: string;
  initial: TimetableSettings;
  context: { kind: 'tenant' } | { kind: 'cycle'; cycleId: string };
}) {
  const t = useTranslations('admin.timetableSettings');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res =
        context.kind === 'tenant'
          ? await upsertTimetableSettingsAction(fd)
          : await upsertCycleTimetableSettingsAction(context.cycleId, fd);
      if (!res.ok) {
        setError(res.error);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        router.refresh();
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-slate-700">{t('days.title')}</h3>
        <p className="mt-1 text-xs text-slate-500">{t('days.hint')}</p>

        <div className="mt-4 space-y-2">
          {DAY_KEYS.map((d) => (
            <div
              key={d}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2"
            >
              <span className="font-medium text-slate-900">{t(`days.${d}`)}</span>
              <select
                name={`day_${d}`}
                defaultValue={initial.days[d] ?? 'FULL'}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
              >
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    {t(`modes.${m}`)}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
              {t('morningEndsAt')}
            </span>
            <input
              type="time"
              name="morningEndsAt"
              defaultValue={initial.morningEndsAt}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
            <span className="mt-1 block text-xs text-slate-500">
              {t('morningEndsAtHint')}
            </span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
              {t('afternoonStartsAt')}
            </span>
            <input
              type="time"
              name="afternoonStartsAt"
              defaultValue={initial.afternoonStartsAt}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
            <span className="mt-1 block text-xs text-slate-500">
              {t('afternoonStartsAtHint')}
            </span>
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-slate-700">{t('lunch.title')}</h3>
        <p className="mt-1 text-xs text-slate-500">{t('lunch.hint')}</p>

        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="lunchEnabled"
            defaultChecked={initial.lunchBreak.enabled}
            className="h-4 w-4"
          />
          <span>{t('lunch.enabled')}</span>
        </label>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
              {t('lunch.from')}
            </span>
            <input
              type="time"
              name="lunchFrom"
              defaultValue={initial.lunchBreak.from}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
              {t('lunch.to')}
            </span>
            <input
              type="time"
              name="lunchTo"
              defaultValue={initial.lunchBreak.to}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </label>
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        {saved && <span className="text-xs text-emerald-700">✓ {t('saved')}</span>}
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
