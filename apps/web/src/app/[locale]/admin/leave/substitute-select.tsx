'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  assignSubstituteAction,
  validateSubstitutionAction,
  approveSubstitutionAction,
  refuseSubstitutionAction,
} from './substitution-actions';

type Candidate = { id: string; name: string; qualified: boolean; cycles?: string };
type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REFUSED';

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
          {c.qualified ? '★ ' : ''}
          {c.name}
          {c.cycles ? ` — ${c.cycles}` : ''}
        </option>
      ))}
    </select>
  );
}

/**
 * Validation du remplacement par la vie scolaire. Visible seulement quand un
 * remplaçant est affecté. La validation SOUMET le remplacement à l'approbation
 * de la direction (les messages partent à l'approbation, pas ici).
 */
export function ValidateSubstitutionButton({
  entryId,
  date,
  leaveId,
  hasOverride,
  validated,
}: {
  entryId: string;
  date: string;
  leaveId: string;
  hasOverride: boolean;
  validated: boolean;
}) {
  const t = useTranslations('admin.leave.subs');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');

  if (!hasOverride) return null;
  if (validated) {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
        ✓ {t('validated')}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <button
        type="button"
        onClick={() =>
          start(async () => {
            setErr('');
            const r = await validateSubstitutionAction(entryId, date, leaveId);
            if (!r.ok) setErr(r.error);
            else router.refresh();
          })
        }
        disabled={pending}
        className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {t('validate')}
      </button>
      {err && <span className="text-[10px] text-red-600">{err}</span>}
    </span>
  );
}

/**
 * Approbation / refus d'un remplacement validé.
 * - Non validé → rien (l'approbation vient après la validation vie scolaire).
 * - Validé + PENDING : direction/admin voient Approuver/Refuser ; les autres
 *   voient « En attente d'approbation ».
 * - APPROVED / REFUSED → badge d'état.
 * L'approbation déclenche l'envoi des messages au remplaçant et aux parents.
 */
export function ApprovalCell({
  entryId,
  date,
  leaveId,
  hasOverride,
  validated,
  status,
  comment,
  canApprove,
}: {
  entryId: string;
  date: string;
  leaveId: string;
  hasOverride: boolean;
  validated: boolean;
  status: ApprovalStatus;
  comment: string | null;
  canApprove: boolean;
}) {
  const t = useTranslations('admin.leave.subs');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');

  if (!hasOverride || !validated) return <span className="text-xs text-slate-300">—</span>;

  if (status === 'APPROVED') {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
        ✓ {t('approved')}
      </span>
    );
  }
  if (status === 'REFUSED') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-lg bg-red-100 px-2 py-1 text-xs font-medium text-red-700"
        title={comment ?? undefined}
      >
        ✕ {t('refused')}
      </span>
    );
  }
  // PENDING
  if (!canApprove) {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
        {t('awaitingApproval')}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className="flex gap-1.5">
        <button
          type="button"
          onClick={() =>
            start(async () => {
              setErr('');
              const r = await approveSubstitutionAction(entryId, date, leaveId);
              if (!r.ok) setErr(r.error);
              else router.refresh();
            })
          }
          disabled={pending}
          className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {t('approve')}
        </button>
        <button
          type="button"
          onClick={() =>
            start(async () => {
              setErr('');
              const reason = window.prompt(t('refuseReason')) ?? undefined;
              const r = await refuseSubstitutionAction(entryId, date, leaveId, reason);
              if (!r.ok) setErr(r.error);
              else router.refresh();
            })
          }
          disabled={pending}
          className="rounded-lg border border-red-300 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          {t('refuse')}
        </button>
      </span>
      {err && <span className="text-[10px] text-red-600">{err}</span>}
    </span>
  );
}
