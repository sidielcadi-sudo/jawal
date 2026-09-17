'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { uploadJustification } from '@/components/leave/justification-upload';
import {
  seedDefaultLeaveTypesAction,
  createLeaveRequestAction,
  reviewLeaveRequestAction,
  cancelLeaveRequestAction,
} from './actions';

type Opt = { id: string; label: string };
// Mêmes champs que les filtres de la page Élèves.
const input =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';
const labelCls = 'block text-xs font-medium text-slate-600';

export function SeedTypesButton() {
  const t = useTranslations('admin.leave');
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => start(async () => { await seedDefaultLeaveTypesAction(); router.refresh(); })}
      disabled={pending}
      className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
    >
      {t('seedTypes')}
    </button>
  );
}

/**
 * Bandeau de la page et bloc de demande, repliés comme la page Heures
 * supplémentaires : on vient ici pour suivre et décider, la saisie est
 * l'exception. Le bloc s'ouvre sur « Nouvelle demande ».
 */
export function LeaveHeader({
  title,
  subtitle,
  reportHref,
  reportLabel,
  staff,
  types,
  canCreate,
}: {
  title: string;
  subtitle: string;
  reportHref: string;
  reportLabel: string;
  staff: Opt[];
  types: Opt[];
  canCreate: boolean;
}) {
  const t = useTranslations('admin.leave');
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <div>
          <h1 className="text-base font-bold text-slate-900">🏖️ {title}</h1>
          <p className="mt-0.5 text-sm text-slate-600">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canCreate && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600"
            >
              + {t('newRequestButton')}
            </button>
          )}
          <a
            href={reportHref}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            📊 {reportLabel}
          </a>
        </div>
      </header>

      {open && (
        <section className="mb-4 rounded-2xl border border-brand-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">{t('newRequest')}</h2>
          <CreateRequestForm staff={staff} types={types} onDone={() => setOpen(false)} />
        </section>
      )}
    </>
  );
}

export function CreateRequestForm({
  staff,
  types,
  onDone,
}: {
  staff: Opt[];
  types: Opt[];
  onDone?: () => void;
}) {
  const t = useTranslations('admin.leave');
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');
  const [part, setPart] = useState<'FULL' | 'AM' | 'PM' | 'SESSIONS'>('FULL');

  return (
    <form
      ref={ref}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setErr('');
        // Le justificatif s'attache après coup : la pièce est rattachée à la
        // demande, qui n'a son id qu'une fois créée.
        const file = fd.get('justification');
        fd.delete('justification');
        start(async () => {
          const r = await createLeaveRequestAction(fd);
          if (!r.ok) return setErr(r.error);
          if (file instanceof File && file.size > 0 && r.id) {
            const upErr = await uploadJustification(r.id, file);
            if (upErr) setErr(upErr);
          }
          ref.current?.reset();
          setPart('FULL');
          onDone?.();
          router.refresh();
        });
      }}
      className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3"
    >
      <label className={labelCls}>
        {t('employee')}
        <select name="personId" required defaultValue="" className={`mt-1 ${input}`}>
          <option value="" disabled>
            {t('choose')}
          </option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className={labelCls}>
        {t('type')}
        <select name="leaveTypeId" required defaultValue="" className={`mt-1 ${input}`}>
          <option value="" disabled>
            {t('type')}
          </option>
          {types.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      {/* Portée : une absence ne dure pas toujours la journée entière. */}
      <label className={labelCls}>
        {t('duration')}
        <select
          name="dayPart"
          value={part}
          onChange={(e) => setPart(e.target.value as 'FULL' | 'AM' | 'PM' | 'SESSIONS')}
          className={`mt-1 ${input}`}
        >
          {(['FULL', 'AM', 'PM', 'SESSIONS'] as const).map((p) => (
            <option key={p} value={p}>
              {t(`dayParts.${p}`)}
            </option>
          ))}
        </select>
      </label>
      <label className={labelCls}>
        {t('start')}
        <input name="startDate" type="date" required className={`mt-1 ${input}`} />
      </label>
      <label className={labelCls}>
        {t('end')}
        <input name="endDate" type="date" required className={`mt-1 ${input}`} />
      </label>
      {part === 'SESSIONS' ? (
        <label className={labelCls}>
          {t('sessionCount')}
          <input
            name="sessionCount"
            type="number"
            min={1}
            max={12}
            defaultValue={1}
            required
            className={`mt-1 ${input}`}
          />
        </label>
      ) : (
        <label className={labelCls}>
          {t('reason')}
          <input name="reason" className={`mt-1 ${input}`} />
        </label>
      )}
      <label className="flex flex-col gap-0.5 text-xs text-slate-500 lg:col-span-3">
        {t('justificationAdd')}
        <input
          type="file"
          name="justification"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          className="text-xs file:me-2 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-2 file:py-1 file:text-xs file:text-slate-700"
        />
      </label>
      <div className="lg:col-span-3">
        <button disabled={pending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {t('submit')}
        </button>
        {err && <span className="ms-2 text-xs text-red-700">{err}</span>}
      </div>
    </form>
  );
}

export function RequestRowActions({ id, status }: { id: string; status: string }) {
  const t = useTranslations('admin.leave');
  const router = useRouter();
  const [pending, start] = useTransition();

  function review(decision: 'APPROVED' | 'REJECTED') {
    const comment = decision === 'REJECTED' ? window.prompt(t('rejectComment')) ?? undefined : undefined;
    start(async () => { await reviewLeaveRequestAction(id, decision, comment); router.refresh(); });
  }
  function cancel() {
    if (!window.confirm(t('cancelConfirm'))) return;
    start(async () => { await cancelLeaveRequestAction(id); router.refresh(); });
  }

  if (status === 'PENDING') {
    return (
      <span className="flex justify-end gap-1.5">
        <button onClick={() => review('APPROVED')} disabled={pending} className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">{t('approve')}</button>
        <button onClick={() => review('REJECTED')} disabled={pending} className="rounded-lg border border-red-300 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">{t('reject')}</button>
      </span>
    );
  }
  if (status === 'APPROVED') {
    return (
      <button onClick={cancel} disabled={pending} className="text-xs text-slate-400 hover:text-red-600 disabled:opacity-50">{t('cancel')}</button>
    );
  }
  return null;
}
