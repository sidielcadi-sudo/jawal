'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { uploadJustification } from '@/components/leave/justification-upload';
import { createOwnLeaveRequestAction, cancelOwnLeaveRequestAction } from './actions';

type Opt = { id: string; label: string };
// Mêmes champs que les listes de l'administration.
const input =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';
const labelCls = 'block text-xs font-medium text-slate-600';

export function CreateOwnRequestForm({ types }: { types: Opt[] }) {
  const t = useTranslations('enseignant.leave');
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
          const r = await createOwnLeaveRequestAction(fd);
          if (!r.ok) return setErr(r.error);
          if (file instanceof File && file.size > 0 && r.id) {
            const upErr = await uploadJustification(r.id, file);
            if (upErr) setErr(upErr);
          }
          ref.current?.reset();
          setPart('FULL');
          router.refresh();
        });
      }}
      className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4"
    >
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
      {/* Une absence peut ne couvrir que le matin, l'après-midi ou
          quelques séances : le remplacement porte sur ces séances-là. */}
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
      {part === 'SESSIONS' && (
        <label className={labelCls}>
          {t('sessionCount')}
          <input name="sessionCount" type="number" min={1} max={12} defaultValue={1} required className={`mt-1 ${input}`} />
        </label>
      )}
      <label className={`${labelCls} lg:col-span-2`}>
        {t('reason')}
        <input name="reason" className={`mt-1 ${input}`} />
      </label>
      <label className="flex flex-col gap-0.5 text-xs text-slate-500 lg:col-span-2">
        {t('justificationAdd')}
        <input
          type="file"
          name="justification"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          className="text-xs file:me-2 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-2 file:py-1 file:text-xs file:text-slate-700"
        />
      </label>
      <div className="lg:col-span-4">
        <button
          disabled={pending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {t('submit')}
        </button>
        {err && <span className="ms-2 text-xs text-red-700">{err}</span>}
      </div>
    </form>
  );
}

export function CancelOwnRequest({ id }: { id: string }) {
  const t = useTranslations('enseignant.leave');
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => {
        if (!window.confirm(t('cancelConfirm'))) return;
        start(async () => {
          await cancelOwnLeaveRequestAction(id);
          router.refresh();
        });
      }}
      disabled={pending}
      className="text-xs text-slate-400 hover:text-red-600 disabled:opacity-50"
    >
      {t('cancel')}
    </button>
  );
}
