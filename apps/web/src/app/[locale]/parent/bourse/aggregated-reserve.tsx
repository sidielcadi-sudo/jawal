'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  reserveCopyAction,
  cancelReservationAction,
} from '@/app/[locale]/parent/children/[childId]/bourse-actions';

type Kid = { id: string; name: string };

/** Réservation depuis la bourse agrégée : choix de l'enfant destinataire. */
export function AggregatedReserve({
  copyId,
  kids,
  reservedChildId,
}: {
  copyId: string;
  kids: Kid[];
  reservedChildId: string | null;
}) {
  const t = useTranslations('parent.child.bourse');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');
  const [sel, setSel] = useState(kids[0]?.id ?? '');

  if (reservedChildId) {
    const name = kids.find((k) => k.id === reservedChildId)?.name ?? '';
    return (
      <span className="flex items-center justify-end gap-1.5">
        {err && <span className="text-[10px] text-red-600" title={err}>!</span>}
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">{t('reservedFor')} {name}</span>
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => { setErr(''); const r = await cancelReservationAction(copyId, reservedChildId); if (!r.ok) return setErr(r.error); router.refresh(); })}
          className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {t('cancel')}
        </button>
      </span>
    );
  }

  return (
    <span className="flex items-center justify-end gap-1.5">
      {err && <span className="text-[10px] text-red-600" title={err}>!</span>}
      <select value={sel} onChange={(e) => setSel(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
        {kids.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
      </select>
      <button
        type="button"
        disabled={pending || !sel}
        onClick={() => start(async () => { setErr(''); const r = await reserveCopyAction(copyId, sel); if (!r.ok) return setErr(r.error); router.refresh(); })}
        className="rounded-lg bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {t('reserve')}
      </button>
    </span>
  );
}
