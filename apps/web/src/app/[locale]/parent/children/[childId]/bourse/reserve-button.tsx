'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { reserveCopyAction, cancelReservationAction } from '../bourse-actions';

export function ReserveButton({ copyId, childId, reserved }: { copyId: string; childId: string; reserved: boolean }) {
  const t = useTranslations('parent.child.bourse');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');
  return (
    <span className="flex items-center gap-1.5">
      {err && <span className="text-[10px] text-red-600" title={err}>!</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => { setErr(''); const r = reserved ? await cancelReservationAction(copyId, childId) : await reserveCopyAction(copyId, childId); if (!r.ok) return setErr(r.error); router.refresh(); })}
        className={`rounded-lg px-3 py-1 text-xs font-medium disabled:opacity-50 ${reserved ? 'border border-slate-300 text-slate-600 hover:bg-slate-50' : 'bg-brand-600 text-white hover:bg-brand-700'}`}
      >
        {reserved ? t('cancel') : t('reserve')}
      </button>
    </span>
  );
}
