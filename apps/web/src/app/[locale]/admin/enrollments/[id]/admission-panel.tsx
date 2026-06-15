'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  acceptEnrollmentAction,
  refuseEnrollmentAction,
  validatePaymentAction,
  affectEnrollmentAction,
  activateEnrollmentAction,
  validateDocumentAction,
} from '../admission-actions';

export type DocRow = {
  requiredId: string;
  label: string;
  doc: { id: string; status: 'PENDING' | 'VALID' | 'INVALID'; filename: string } | null;
};
export type ClassOption = { id: string; name: string; capacity: number; count: number };
export type DiscountOption = { id: string; label: string; pct: number };
export type OtherDoc = { id: string; label: string; status: 'PENDING' | 'VALID' | 'INVALID' };

const STEPS = ['pending', 'accepted', 'paid', 'affected', 'active'] as const;
const STEP_OF: Record<string, number> = {
  DRAFT: 0,
  DOCUMENTS_MANQUANTS: 0,
  DOSSIER_COMPLET: 0,
  ACCEPTE: 1,
  INSCRIPTION_VALIDEE: 2,
  AFFECTE: 3,
  ACTIVE: 4,
};
const PRE_DECISION = ['DRAFT', 'DOCUMENTS_MANQUANTS', 'DOSSIER_COMPLET'];

export function AdmissionPanel({
  enrollmentId,
  status,
  docs,
  classes,
  discountRules,
  otherDocs,
}: {
  enrollmentId: string;
  status: string;
  docs: DocRow[];
  classes: ClassOption[];
  discountRules: DiscountOption[];
  otherDocs: OtherDoc[];
}) {
  const t = useTranslations('admin.enrollments.admission');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');
  const [classId, setClassId] = useState('');
  const [discountRuleId, setDiscountRuleId] = useState('');
  const closed = status === 'REFUSE' || status === 'WITHDRAWN' || status === 'GRADUATED';
  const docsEditable = !closed && status !== 'ACTIVE';

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setErr('');
    start(async () => {
      const r = await fn();
      if (!r.ok) setErr(r.error ?? 'Erreur');
      else router.refresh();
    });
  }

  async function upload(requiredId: string, file: File) {
    setErr('');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('requiredDocumentId', requiredId);
    const r = await fetch(`/api/admin/enrollments/${enrollmentId}/documents`, {
      method: 'POST',
      body: fd,
    });
    if (!r.ok) setErr(await r.text());
    else router.refresh();
  }

  const current = STEP_OF[status] ?? 0;

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-700">{t('title')}</h2>

      {/* Stepper */}
      <ol className="mt-4 flex flex-wrap items-center gap-1.5 text-[11px]">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-1.5">
            <span
              className={`rounded-full px-2.5 py-1 font-medium ${
                closed
                  ? 'bg-slate-100 text-slate-400'
                  : i < current
                    ? 'bg-emerald-100 text-emerald-700'
                    : i === current
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-100 text-slate-500'
              }`}
            >
              {t(`steps.${s}`)}
            </span>
            {i < STEPS.length - 1 && <span className="text-slate-300">→</span>}
          </li>
        ))}
        {closed && (
          <li className="ms-2 rounded-full bg-red-100 px-2.5 py-1 font-medium text-red-700">
            {t(`closed.${status}`)}
          </li>
        )}
      </ol>

      {err && <p className="mt-3 text-sm text-red-700">{err}</p>}

      {/* Documents — toujours visibles ; lecture seule une fois le dossier validé/clos (#8) */}
      <div className="mt-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t('documents')}
        </h3>
        <ul className="mt-2 space-y-1.5">
          {docs.length === 0 && <li className="text-xs text-slate-400">{t('noRequiredDocs')}</li>}
          {docs.map((d) => (
            <li
              key={d.requiredId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-1.5 text-sm"
            >
              <span className="flex items-center gap-2">
                <DocStatusBadge status={d.doc?.status ?? null} t={t} />
                <span className="text-slate-700">{d.label}</span>
              </span>
              <span className="flex items-center gap-2 text-xs">
                {d.doc && (
                  <a
                    href={`/api/admin/enrollments/${enrollmentId}/documents/${d.doc.id}`}
                    target="_blank"
                    rel="noopener"
                    className="text-brand-700 hover:underline"
                  >
                    {t('view')}
                  </a>
                )}
                {docsEditable && d.doc && d.doc.status !== 'VALID' && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => validateDocumentAction(d.doc!.id, 'VALID'))}
                    className="text-emerald-700 hover:underline disabled:opacity-50"
                  >
                    {t('validate')}
                  </button>
                )}
                {docsEditable && d.doc && d.doc.status !== 'INVALID' && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => validateDocumentAction(d.doc!.id, 'INVALID'))}
                    className="text-red-600 hover:underline disabled:opacity-50"
                  >
                    {t('invalidate')}
                  </button>
                )}
                {docsEditable && (
                  <label className="cursor-pointer rounded border border-slate-300 px-2 py-0.5 text-slate-600 hover:bg-slate-50">
                    {d.doc ? t('replace') : t('upload')}
                    <input
                      type="file"
                      accept="application/pdf,image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) upload(d.requiredId, f);
                      }}
                    />
                  </label>
                )}
              </span>
            </li>
          ))}
          {otherDocs.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-1.5 text-sm"
            >
              <span className="flex items-center gap-2">
                <DocStatusBadge status={d.status} t={t} />
                <span className="text-slate-700">{d.label || t('otherDoc')}</span>
              </span>
              <a
                href={`/api/admin/enrollments/${enrollmentId}/documents/${d.id}`}
                target="_blank"
                rel="noopener"
                className="text-xs text-brand-700 hover:underline"
              >
                {t('view')}
              </a>
            </li>
          ))}
        </ul>
      </div>

      {/* Transitions */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {PRE_DECISION.includes(status) && (
          <>
            <select
              value={discountRuleId}
              onChange={(e) => setDiscountRuleId(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
            >
              <option value="">{t('discountNone')}</option>
              {discountRules.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label} (−{d.pct}%)
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                const rule = discountRules.find((d) => d.id === discountRuleId);
                run(() =>
                  acceptEnrollmentAction(
                    enrollmentId,
                    rule ? rule.pct : undefined,
                    rule ? rule.label : undefined,
                  ),
                );
              }}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {t('accept')}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!window.confirm(t('refuseConfirm'))) return;
                const r = window.prompt(t('refuseReasonPrompt'));
                if (r) run(() => refuseEnrollmentAction(enrollmentId, r));
              }}
              className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {t('refuse')}
            </button>
          </>
        )}

        {status === 'ACCEPTE' && (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => validatePaymentAction(enrollmentId))}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {t('validatePayment')}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!window.confirm(t('refuseConfirm'))) return;
                const r = window.prompt(t('refuseReasonPrompt'));
                if (r) run(() => refuseEnrollmentAction(enrollmentId, r));
              }}
              className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {t('refuse')}
            </button>
          </>
        )}

        {status === 'INSCRIPTION_VALIDEE' && (
          <>
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
            >
              <option value="">
                {classes.length === 0 ? t('noClass') : t('choosePlaceholder')}
              </option>
              {classes.map((c) => (
                <option key={c.id} value={c.id} disabled={c.count >= c.capacity}>
                  {c.name} ({c.count}/{c.capacity})
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={pending || !classId}
              onClick={() => run(() => affectEnrollmentAction(enrollmentId, classId))}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {t('affect')}
            </button>
          </>
        )}

        {status === 'AFFECTE' && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => activateEnrollmentAction(enrollmentId))}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {t('activate')}
          </button>
        )}
      </div>
    </section>
  );
}

function DocStatusBadge({
  status,
  t,
}: {
  status: 'PENDING' | 'VALID' | 'INVALID' | null;
  t: (k: string) => string;
}) {
  const map: Record<string, string> = {
    PENDING: 'bg-amber-100 text-amber-700',
    VALID: 'bg-emerald-100 text-emerald-700',
    INVALID: 'bg-red-100 text-red-700',
  };
  const key = status ?? 'MISSING';
  const cls = status ? map[status] : 'bg-slate-100 text-slate-500';
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {t(`docStatus.${key}`)}
    </span>
  );
}
