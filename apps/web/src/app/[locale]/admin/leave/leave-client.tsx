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
const input = 'rounded-lg border border-slate-300 px-3 py-2 text-sm';

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

export function CreateRequestForm({ staff, types }: { staff: Opt[]; types: Opt[] }) {
  const t = useTranslations('admin.leave');
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');

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
          router.refresh();
        });
      }}
      className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-5"
    >
      <select name="personId" required defaultValue="" className={input}>
        <option value="" disabled>{t('choose')}</option>
        {staff.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
      <select name="leaveTypeId" required defaultValue="" className={input}>
        <option value="" disabled>{t('type')}</option>
        {types.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
      <input name="startDate" type="date" required className={input} title={t('start')} />
      <input name="endDate" type="date" required className={input} title={t('end')} />
      <input name="reason" placeholder={t('reason')} className={input} />
      <label className="flex flex-col gap-0.5 text-xs text-slate-500 lg:col-span-2">
        {t('justificationAdd')}
        <input
          type="file"
          name="justification"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          className="text-xs file:me-2 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-2 file:py-1 file:text-xs file:text-slate-700"
        />
      </label>
      <div className="lg:col-span-5">
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
