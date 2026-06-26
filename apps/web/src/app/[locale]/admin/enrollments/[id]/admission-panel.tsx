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
export type FeeLine = {
  feeId: string;
  category: string;
  categoryLabel: string;
  feeLabel: string;
  amount: number;
  installmentCount: number;
  installmentLocked: boolean;
  discounts: DiscountOption[];
};
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
  feeLines,
  currency,
  otherDocs,
}: {
  enrollmentId: string;
  status: string;
  docs: DocRow[];
  classes: ClassOption[];
  feeLines: FeeLine[];
  currency: string;
  otherDocs: OtherDoc[];
}) {
  const t = useTranslations('admin.enrollments.admission');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');
  const [classId, setClassId] = useState('');
  // Lignes de frais éditables (réduction + nb d'échéances par frais).
  const [lines, setLines] = useState<Record<string, { discountRuleId: string; count: number }>>(
    () =>
      Object.fromEntries(
        feeLines.map((f) => [f.feeId, { discountRuleId: '', count: f.installmentCount }]),
      ),
  );
  const setLine = (feeId: string, patch: Partial<{ discountRuleId: string; count: number }>) =>
    setLines((prev) => ({ ...prev, [feeId]: { ...prev[feeId]!, ...patch } }));
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

      {/* Table de frais (PRE_DECISION) : Type · Montant · Réduction · Échéances */}
      {PRE_DECISION.includes(status) && (
        <div className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t('feeTable.title')}
          </h3>
          {feeLines.length === 0 ? (
            <p className="mt-2 text-xs text-amber-700">{t('feeTable.empty')}</p>
          ) : (
            <div className="mt-2 overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-start">{t('feeTable.type')}</th>
                    <th className="px-3 py-2 text-end">{t('feeTable.amount')}</th>
                    <th className="px-3 py-2 text-start">{t('feeTable.discount')}</th>
                    <th className="px-3 py-2 text-center">{t('feeTable.installments')}</th>
                    <th className="px-3 py-2 text-end">{t('feeTable.perInstallment')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {feeLines.map((f) => {
                    const line = lines[f.feeId]!;
                    const pct = f.discounts.find((d) => d.id === line.discountRuleId)?.pct ?? 0;
                    const net = Math.round(f.amount * (1 - pct / 100) * 100) / 100;
                    const count = Math.max(1, line.count || 1);
                    const per = Math.round((net / count) * 100) / 100;
                    return (
                      <tr key={f.feeId}>
                        <td className="px-3 py-2">
                          <span className="font-medium text-slate-800">{f.categoryLabel}</span>
                          <span className="text-slate-400"> · {f.feeLabel}</span>
                        </td>
                        <td className="px-3 py-2 text-end tabular-nums">
                          {f.amount.toFixed(2)} {currency}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={line.discountRuleId}
                            onChange={(e) => setLine(f.feeId, { discountRuleId: e.target.value })}
                            className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                          >
                            <option value="">{t('discountNone')}</option>
                            {f.discounts.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.label} (−{d.pct}%)
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="number"
                            min={1}
                            max={24}
                            value={line.count}
                            disabled={f.installmentLocked}
                            onChange={(e) => setLine(f.feeId, { count: Number(e.target.value) })}
                            className="w-16 rounded border border-slate-300 px-2 py-1 text-center text-xs disabled:bg-slate-100 disabled:text-slate-500"
                            title={f.installmentLocked ? t('feeTable.locked') : undefined}
                          />
                        </td>
                        <td className="px-3 py-2 text-end tabular-nums text-slate-600">
                          {count}× {per.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50 text-xs font-medium text-slate-700">
                  <tr>
                    <td className="px-3 py-2" colSpan={4}>
                      {t('feeTable.total')}
                    </td>
                    <td className="px-3 py-2 text-end tabular-nums">
                      {feeLines
                        .reduce((s, f) => {
                          const pct =
                            f.discounts.find((d) => d.id === lines[f.feeId]!.discountRuleId)?.pct ?? 0;
                          return s + f.amount * (1 - pct / 100);
                        }, 0)
                        .toFixed(2)}{' '}
                      {currency}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Transitions */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {PRE_DECISION.includes(status) && (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(() =>
                  acceptEnrollmentAction(
                    enrollmentId,
                    feeLines.map((f) => ({
                      feeId: f.feeId,
                      discountRuleId: lines[f.feeId]!.discountRuleId || null,
                      count: Math.max(1, lines[f.feeId]!.count || 1),
                    })),
                  ),
                )
              }
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
