'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

type PayrollMethod = 'BANK_TRANSFER' | 'CHECK' | 'CASH' | 'OTHER';
type Diploma = { title: string; institution?: string; year?: number };
type Benefit = { label: string; amount: number };
type Deduction = { label: string; amount: number; date?: string };
type Slot = { from: string; to: string };
type Availability = Record<'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN', Slot[]>;

const DAYS: Array<keyof Availability> = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const inputCls =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

/// Sélection multi : Spécialités (matières) + Cycles enseignés.
/// Émet un événement onChange avec la liste des IDs sélectionnés. Sérialisé
/// dans le formulaire via un input caché.
export function MultiPicker({
  name,
  label,
  hint,
  options,
  initial,
}: {
  name: string;
  label: string;
  hint?: string;
  options: { id: string; label: string }[];
  initial: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initial));

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  return (
    <div>
      <span className="block text-xs font-medium text-slate-700">{label}</span>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      <input type="hidden" name={name} value={JSON.stringify([...selected])} />
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => {
          const active = selected.has(o.id);
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => toggle(o.id)}
              className={[
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                active
                  ? 'border-brand-600 bg-brand-100 text-brand-800'
                  : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
              ].join(' ')}
            >
              {active ? '✓ ' : ''}
              {o.label}
            </button>
          );
        })}
        {options.length === 0 && (
          <p className="text-xs text-slate-400">—</p>
        )}
      </div>
    </div>
  );
}

export function DiplomasField({ initial }: { initial: Diploma[] }) {
  const t = useTranslations('admin.persons.form.hr');
  const [items, setItems] = useState<Diploma[]>(initial);

  return (
    <div>
      <span className="block text-xs font-medium text-slate-700">{t('diplomas')}</span>
      <input type="hidden" name="diplomas" value={JSON.stringify(items)} />
      <div className="mt-2 space-y-2">
        {items.map((d, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 rounded-lg border border-slate-200 p-2">
            <input
              type="text"
              placeholder={t('diplomaTitle')}
              value={d.title}
              onChange={(e) =>
                setItems(items.map((x, idx) => (idx === i ? { ...x, title: e.target.value } : x)))
              }
              className={`col-span-5 ${inputCls}`}
            />
            <input
              type="text"
              placeholder={t('diplomaInstitution')}
              value={d.institution ?? ''}
              onChange={(e) =>
                setItems(items.map((x, idx) => (idx === i ? { ...x, institution: e.target.value } : x)))
              }
              className={`col-span-5 ${inputCls}`}
            />
            <input
              type="number"
              min={1950}
              max={2100}
              placeholder={t('diplomaYear')}
              value={d.year ?? ''}
              onChange={(e) =>
                setItems(items.map((x, idx) =>
                  idx === i ? { ...x, year: e.target.value ? Number(e.target.value) : undefined } : x,
                ))
              }
              className={`col-span-2 ${inputCls}`}
            />
            <button
              type="button"
              onClick={() => setItems(items.filter((_, idx) => idx !== i))}
              className="col-span-12 text-xs text-red-600 hover:text-red-800"
            >
              {t('remove')}
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setItems([...items, { title: '' }])}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          + {t('addDiploma')}
        </button>
      </div>
    </div>
  );
}

export function AvailabilityField({ initial }: { initial: Availability }) {
  const t = useTranslations('admin.persons.form.hr');
  const [grid, setGrid] = useState<Availability>(() => {
    const base = { MON: [], TUE: [], WED: [], THU: [], FRI: [], SAT: [], SUN: [] } as Availability;
    return { ...base, ...initial };
  });

  function addSlot(day: keyof Availability) {
    setGrid({ ...grid, [day]: [...grid[day], { from: '08:00', to: '12:00' }] });
  }
  function removeSlot(day: keyof Availability, idx: number) {
    setGrid({ ...grid, [day]: grid[day].filter((_, i) => i !== idx) });
  }
  function update(day: keyof Availability, idx: number, patch: Partial<Slot>) {
    setGrid({
      ...grid,
      [day]: grid[day].map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    });
  }

  return (
    <div>
      <span className="block text-xs font-medium text-slate-700">{t('availability')}</span>
      <p className="mt-0.5 text-xs text-slate-500">{t('availabilityHint')}</p>
      <input type="hidden" name="availability" value={JSON.stringify(grid)} />
      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
        {DAYS.map((day) => (
          <div key={day} className="rounded-lg border border-slate-200 p-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-700">{t(`day.${day}` as never)}</span>
              <button
                type="button"
                onClick={() => addSlot(day)}
                className="text-xs text-brand-700 hover:underline"
              >
                + {t('addSlot')}
              </button>
            </div>
            {grid[day].length === 0 ? (
              <p className="mt-1 text-xs text-slate-400">{t('noSlot')}</p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {grid[day].map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="time"
                      value={s.from}
                      onChange={(e) => update(day, i, { from: e.target.value })}
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                    />
                    <span className="text-xs text-slate-500">→</span>
                    <input
                      type="time"
                      value={s.to}
                      onChange={(e) => update(day, i, { to: e.target.value })}
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => removeSlot(day, i)}
                      className="ms-auto text-xs text-red-600 hover:text-red-800"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function BenefitsField({ initial }: { initial: Benefit[] }) {
  const t = useTranslations('admin.persons.form.hr');
  const [items, setItems] = useState<Benefit[]>(initial);
  return (
    <div>
      <span className="block text-xs font-medium text-slate-700">{t('benefits')}</span>
      <p className="mt-0.5 text-xs text-slate-500">{t('benefitsHint')}</p>
      <input type="hidden" name="benefits" value={JSON.stringify(items)} />
      <div className="mt-2 space-y-2">
        {items.map((b, i) => (
          <div key={i} className="flex flex-wrap gap-2">
            <input
              type="text"
              placeholder={t('benefitLabel')}
              value={b.label}
              onChange={(e) =>
                setItems(items.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x)))
              }
              className={`flex-1 min-w-[200px] ${inputCls}`}
            />
            <input
              type="number"
              min={0}
              step="any"
              placeholder={t('amount')}
              value={b.amount}
              onChange={(e) =>
                setItems(items.map((x, idx) => (idx === i ? { ...x, amount: Number(e.target.value) || 0 } : x)))
              }
              className={`w-32 ${inputCls}`}
            />
            <button
              type="button"
              onClick={() => setItems(items.filter((_, idx) => idx !== i))}
              className="text-xs text-red-600 hover:text-red-800"
            >
              {t('remove')}
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setItems([...items, { label: '', amount: 0 }])}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          + {t('addBenefit')}
        </button>
      </div>
    </div>
  );
}

export function DeductionsField({ initial }: { initial: Deduction[] }) {
  const t = useTranslations('admin.persons.form.hr');
  const [items, setItems] = useState<Deduction[]>(initial);
  return (
    <div>
      <span className="block text-xs font-medium text-slate-700">{t('deductions')}</span>
      <p className="mt-0.5 text-xs text-slate-500">{t('deductionsHint')}</p>
      <input type="hidden" name="deductions" value={JSON.stringify(items)} />
      <div className="mt-2 space-y-2">
        {items.map((d, i) => (
          <div key={i} className="flex flex-wrap gap-2">
            <input
              type="text"
              placeholder={t('deductionLabel')}
              value={d.label}
              onChange={(e) =>
                setItems(items.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x)))
              }
              className={`flex-1 min-w-[180px] ${inputCls}`}
            />
            <input
              type="number"
              min={0}
              step="any"
              placeholder={t('amount')}
              value={d.amount}
              onChange={(e) =>
                setItems(items.map((x, idx) => (idx === i ? { ...x, amount: Number(e.target.value) || 0 } : x)))
              }
              className={`w-28 ${inputCls}`}
            />
            <input
              type="date"
              value={d.date ?? ''}
              onChange={(e) =>
                setItems(items.map((x, idx) => (idx === i ? { ...x, date: e.target.value || undefined } : x)))
              }
              className={`w-40 ${inputCls}`}
            />
            <button
              type="button"
              onClick={() => setItems(items.filter((_, idx) => idx !== i))}
              className="text-xs text-red-600 hover:text-red-800"
            >
              {t('remove')}
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setItems([...items, { label: '', amount: 0 }])}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          + {t('addDeduction')}
        </button>
      </div>
    </div>
  );
}

export const PAYROLL_METHODS: PayrollMethod[] = ['BANK_TRANSFER', 'CHECK', 'CASH', 'OTHER'];
