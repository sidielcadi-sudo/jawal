'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { assignSubstituteAction } from './substitution-actions';

type Candidate = { id: string; name: string; qualified: boolean };

export function SubstituteSelect({
  entryId,
  date,
  leaveId,
  value,
  candidates,
}: {
  entryId: string;
  date: string;
  leaveId: string;
  value: string; // '' | 'CANCELLED' | teacherId
  candidates: Candidate[];
}) {
  const t = useTranslations('admin.leave.subs');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [val, setVal] = useState(value);

  // Qualifiés d'abord, puis les autres.
  const sorted = [...candidates].sort((a, b) => Number(b.qualified) - Number(a.qualified) || a.name.localeCompare(b.name));

  function change(next: string) {
    setVal(next);
    start(async () => {
      await assignSubstituteAction(entryId, date, next, leaveId);
      router.refresh();
    });
  }

  return (
    <select
      value={val}
      disabled={pending}
      onChange={(e) => change(e.target.value)}
      className={`rounded-lg border px-2 py-1 text-xs disabled:opacity-50 ${
        val && val !== 'CANCELLED' ? 'border-emerald-300 bg-emerald-50' : val === 'CANCELLED' ? 'border-slate-300 bg-slate-100' : 'border-amber-300 bg-amber-50'
      }`}
    >
      <option value="">{t('unassigned')}</option>
      <option value="CANCELLED">{t('cancelled')}</option>
      {sorted.map((c) => (
        <option key={c.id} value={c.id}>
          {c.qualified ? '★ ' : ''}{c.name}
        </option>
      ))}
    </select>
  );
}
