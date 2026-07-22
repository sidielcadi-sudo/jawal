'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createSupportCourseAction, updateSupportCourseAction } from './actions';

type Opt = { id: string; label: string };
type Slot = { dayOfWeek: string; startTime: string; endTime: string; roomId: string };
export type CourseInitial = {
  id: string;
  title: string;
  subjectId: string;
  teacherId: string | null;
  levelId: string | null;
  pricingMode: string;
  price: number;
  description: string | null;
  slots: Slot[];
};

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
const PRICING = ['FREE', 'PER_SESSION', 'MONTHLY', 'TERM', 'ANNUAL'] as const;
const input = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';
const cell = 'rounded-lg border border-slate-300 px-2 py-1.5 text-sm';

export function CourseForm({
  subjects,
  teachers,
  levels,
  rooms,
  initial,
}: {
  subjects: Opt[];
  teachers: Opt[];
  levels: Opt[];
  rooms: Opt[];
  initial?: CourseInitial;
}) {
  const t = useTranslations('admin.soutien');
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');
  const [mode, setMode] = useState(initial?.pricingMode ?? 'FREE');
  const [slots, setSlots] = useState<Slot[]>(
    initial?.slots?.length ? initial.slots : [{ dayOfWeek: 'MON', startTime: '', endTime: '', roomId: '' }],
  );

  const setSlot = (i: number, patch: Partial<Slot>) =>
    setSlots((prev) => prev.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const addSlot = () => setSlots((prev) => [...prev, { dayOfWeek: 'MON', startTime: '', endTime: '', roomId: '' }]);
  const removeSlot = (i: number) => setSlots((prev) => prev.filter((_, k) => k !== i));

  const validSlots = slots.filter((s) => s.startTime && s.endTime);

  return (
    <form
      ref={ref}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set('slots', JSON.stringify(validSlots));
        setErr('');
        start(async () => {
          const r = initial
            ? await updateSupportCourseAction(initial.id, fd)
            : await createSupportCourseAction(fd);
          if (!r.ok) return setErr(r.error);
          if (!initial && r.id) router.push(`./soutien/${r.id}`);
          else router.refresh();
          if (!initial) {
            ref.current?.reset();
            setSlots([{ dayOfWeek: 'MON', startTime: '', endTime: '', roomId: '' }]);
            setMode('FREE');
          }
        });
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="block text-sm md:col-span-2">
          <span className="text-xs text-slate-500">{t('form.title')}</span>
          <input name="title" required defaultValue={initial?.title} className={input} placeholder={t('form.titlePlaceholder')} />
        </label>
        <label className="block text-sm">
          <span className="text-xs text-slate-500">{t('form.subject')}</span>
          <select name="subjectId" required defaultValue={initial?.subjectId ?? ''} className={input}>
            <option value="" disabled>{t('form.choose')}</option>
            {subjects.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-xs text-slate-500">{t('form.teacher')}</span>
          <select name="teacherId" defaultValue={initial?.teacherId ?? ''} className={input}>
            <option value="">{t('form.none')}</option>
            {teachers.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-xs text-slate-500">{t('form.level')}</span>
          <select name="levelId" defaultValue={initial?.levelId ?? ''} className={input}>
            <option value="">{t('form.allLevels')}</option>
            {levels.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
      </div>

      {/* Créneaux des séances */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-700">
            {t('form.slotsTitle')} · {t('form.sessionsPerWeek', { count: validSlots.length })}
          </span>
          <button type="button" onClick={addSlot} className="rounded-lg border border-brand-300 bg-white px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50">
            + {t('form.addSlot')}
          </button>
        </div>
        <div className="space-y-2">
          {slots.map((s, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto_auto_1fr_auto] items-center gap-2">
              <select value={s.dayOfWeek} onChange={(e) => setSlot(i, { dayOfWeek: e.target.value })} className={cell}>
                {DAYS.map((d) => <option key={d} value={d}>{t(`days.${d}`)}</option>)}
              </select>
              <input type="time" value={s.startTime} onChange={(e) => setSlot(i, { startTime: e.target.value })} className={cell} />
              <input type="time" value={s.endTime} onChange={(e) => setSlot(i, { endTime: e.target.value })} className={cell} />
              <select value={s.roomId} onChange={(e) => setSlot(i, { roomId: e.target.value })} className={cell}>
                <option value="">{t('form.room')}</option>
                {rooms.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
              <button type="button" onClick={() => removeSlot(i)} className="px-1.5 text-slate-400 hover:text-red-600" title={t('form.removeSlot')}>
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Tarification */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="block text-sm">
          <span className="text-xs text-slate-500">{t('form.pricingMode')}</span>
          <select name="pricingMode" value={mode} onChange={(e) => setMode(e.target.value)} className={input}>
            {PRICING.map((p) => <option key={p} value={p}>{t(`pricing.${p}`)}</option>)}
          </select>
        </label>
        {mode !== 'FREE' && (
          <label className="block text-sm">
            <span className="text-xs text-slate-500">{t(`priceLabel.${mode}`)}</span>
            <input name="price" type="number" min="0" step="0.01" defaultValue={initial?.price || ''} className={input} />
          </label>
        )}
        <label className="block text-sm md:col-span-2">
          <span className="text-xs text-slate-500">{t('form.description')}</span>
          <textarea name="description" rows={2} defaultValue={initial?.description ?? ''} className={input} />
        </label>
      </div>

      <div>
        <button disabled={pending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {initial ? t('form.save') : t('form.create')}
        </button>
        {err && <span className="ms-2 text-xs text-red-700">{err}</span>}
      </div>
    </form>
  );
}
