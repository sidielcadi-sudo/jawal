'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  computeRefundAction,
  approveRefundAction,
  rejectRefundAction,
  payRefundAction,
} from '../refund-actions';

type Line = { category: string; paid: number; consumed: number; refundable: number; due?: number; isRefundable?: boolean };
type Refund = {
  status: string;
  basis: string;
  paidTotal: number;
  consumedTotal: number;
  computedAmount: number;
  approvedAmount: number | null;
  method: string | null;
  reference: string | null;
  directionComment: string | null;
  breakdown: Line[] | null;
  paidAt: string | null;
};

const input = 'rounded-lg border border-slate-300 px-3 py-2 text-sm';

export function RefundPanel({
  radiationId,
  roleCodes,
  currency,
  refund,
}: {
  radiationId: string;
  roleCodes: string[];
  currency: string;
  refund: Refund;
}) {
  const t = useTranslations('admin.enrollments.radiation.refund');
  const tc = useTranslations('admin.settings.fees.form.categories');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');
  const [basis, setBasis] = useState(refund.basis || 'INSTALLMENT');
  const [manual, setManual] = useState('');
  const [override, setOverride] = useState('');
  const [comment, setComment] = useState('');
  const [method, setMethod] = useState('VIREMENT');
  const [reference, setReference] = useState('');

  const has = (r: string) => roleCodes.includes(r) || roleCodes.includes('tenant_admin');
  const canCompta = has('comptable');
  const canDirection = has('direction');
  const money = (n: number) => `${n.toFixed(2)} ${currency}`;
  const amount = refund.approvedAmount ?? refund.computedAmount;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setErr('');
    start(async () => {
      const r = await fn();
      if (!r.ok) return setErr(r.error ?? 'Erreur');
      router.refresh();
    });
  }

  const statusTone: Record<string, string> = {
    PENDING_CHECK: 'bg-amber-100 text-amber-700',
    CALCULATED: 'bg-sky-100 text-sky-700',
    APPROVED: 'bg-indigo-100 text-indigo-700',
    PAID: 'bg-emerald-100 text-emerald-700',
    REJECTED: 'bg-slate-100 text-slate-600',
  };

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-700">{t('title')}</h2>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusTone[refund.status] ?? 'bg-slate-100 text-slate-600'}`}>
          {t(`status.${refund.status}` as never)}
        </span>
      </div>

      {/* Détail par catégorie (dès qu'un calcul existe) */}
      {refund.breakdown && refund.breakdown.length > 0 && (
        <div className="mb-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-start text-slate-500">
                <th className="py-1 text-start font-medium">{t('category')}</th>
                <th className="py-1 text-end font-medium">{t('paidCol')}</th>
                <th className="py-1 text-end font-medium">{t('consumedCol')}</th>
                <th className="py-1 text-end font-medium">{t('dueCol')}</th>
                <th className="py-1 text-end font-medium">{t('refundableCol')}</th>
              </tr>
            </thead>
            <tbody>
              {refund.breakdown.map((l) => (
                <tr key={l.category} className="border-t border-slate-100">
                  <td className="py-1">
                    <span
                      className={`me-1.5 inline-block rounded px-1 py-0.5 text-[9px] font-bold ${
                        l.isRefundable === false ? 'bg-slate-200 text-slate-600' : 'bg-emerald-100 text-emerald-700'
                      }`}
                      title={l.isRefundable === false ? t('nonRefundable') : t('refundableTag')}
                    >
                      {l.isRefundable === false ? 'NR' : 'R'}
                    </span>
                    {tc(l.category as never)}
                  </td>
                  <td className="py-1 text-end tabular-nums">{money(l.paid)}</td>
                  <td className="py-1 text-end tabular-nums text-slate-500">{money(l.consumed)}</td>
                  <td className="py-1 text-end tabular-nums text-amber-700">{money(l.due ?? 0)}</td>
                  <td className="py-1 text-end font-medium tabular-nums text-emerald-700">{money(l.refundable)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 font-medium">
                <td className="py-1">{t('paidTotal')}</td>
                <td className="py-1 text-end tabular-nums">{money(refund.paidTotal)}</td>
                <td className="py-1 text-end tabular-nums">{money(refund.consumedTotal)}</td>
                <td className="py-1 text-end tabular-nums text-amber-700">
                  {money(refund.breakdown.reduce((s, l) => s + (l.due ?? 0), 0))}
                </td>
                <td className="py-1 text-end tabular-nums text-emerald-700">{money(refund.computedAmount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Étape 1 — Comptabilité : calcul */}
      {(refund.status === 'PENDING_CHECK' || refund.status === 'CALCULATED') && (
        canCompta ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-600">{t('basis')}</p>
            <div className="flex flex-col gap-1 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name="basis" checked={basis === 'INSTALLMENT'} onChange={() => setBasis('INSTALLMENT')} />
                {t('basisInstallment')}
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="basis" checked={basis === 'PRORATA'} onChange={() => setBasis('PRORATA')} />
                {t('basisProrata')}
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Btn
                label={refund.status === 'CALCULATED' ? t('recompute') : t('compute')}
                onClick={() => {
                  const m = manual.trim() === '' ? null : Number(manual.replace(',', '.'));
                  run(() => computeRefundAction(radiationId, basis, m != null && !Number.isNaN(m) ? m : null));
                }}
                pending={pending}
              />
              <input
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder={t('manualAmount')}
                inputMode="decimal"
                className={`${input} w-40`}
              />
              {/* Utilisateur ayant les deux droits (compta + direction, ex. admin) :
                  calcule ET valide en une action, directement depuis la saisie. */}
              {canDirection && (
                <Btn
                  label={t('validateNow')}
                  tone="emerald"
                  pending={pending}
                  onClick={() => {
                    const m = manual.trim() === '' ? null : Number(manual.replace(',', '.'));
                    const amt = m != null && !Number.isNaN(m) ? m : null;
                    run(async () => {
                      const r1 = await computeRefundAction(radiationId, basis, amt);
                      if (!r1.ok) return r1;
                      return approveRefundAction(radiationId, amt, comment);
                    });
                  }}
                />
              )}
              <button disabled={pending} onClick={() => run(() => rejectRefundAction(radiationId))} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">{t('reject')}</button>
            </div>
            <p className="text-[11px] text-slate-400">{t('manualHint')}</p>
            {refund.status === 'CALCULATED' && (
              <p className="rounded-lg bg-sky-50 px-2.5 py-1.5 text-xs text-sky-800">
                {t('computed')} : <b>{money(refund.computedAmount)}</b>
                {canDirection ? <> · {t('validateBelow')}</> : <> · {t('waitingDirection')}</>}
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs italic text-slate-400">{t('waitingCompta')}</p>
        )
      )}

      {/* Étape 2 — Direction : validation / correction */}
      {refund.status === 'CALCULATED' && canDirection && (
        <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs text-slate-600">{t('computed')} : <b>{money(refund.computedAmount)}</b></p>
          <input value={override} onChange={(e) => setOverride(e.target.value)} placeholder={t('approvedAmount')} inputMode="decimal" className={`${input} w-40`} />
          <p className="text-[11px] text-slate-400">{t('overrideHint')}</p>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('directionComment')} rows={2} className={`${input} w-full`} />
          <div className="flex flex-wrap gap-2">
            <Btn
              label={t('approve')}
              tone="emerald"
              pending={pending}
              onClick={() => {
                const parsed = override.trim() === '' ? null : Number(override.replace(',', '.'));
                run(() => approveRefundAction(radiationId, parsed != null && !Number.isNaN(parsed) ? parsed : null, comment));
              }}
            />
            <button disabled={pending} onClick={() => run(() => rejectRefundAction(radiationId))} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">{t('reject')}</button>
          </div>
        </div>
      )}
      {refund.status === 'CALCULATED' && !canDirection && !canCompta && (
        <p className="text-xs italic text-slate-400">{t('waitingDirection')}</p>
      )}

      {/* Étape 3 — Comptabilité : paiement */}
      {refund.status === 'APPROVED' && (
        <div className="mt-2 space-y-2">
          <p className="text-sm text-slate-700">{t('approvedAmount')} : <b>{money(amount)}</b></p>
          {refund.directionComment && <p className="text-xs text-slate-500">{t('directionComment')} : {refund.directionComment}</p>}
          {canCompta ? (
            <div className="flex flex-wrap items-end gap-2">
              <select value={method} onChange={(e) => setMethod(e.target.value)} className={input}>
                <option value="VIREMENT">{t('methods.VIREMENT')}</option>
                <option value="CHEQUE">{t('methods.CHEQUE')}</option>
                <option value="ESPECES">{t('methods.ESPECES')}</option>
              </select>
              <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={t('reference')} className={`${input} flex-1`} />
              <Btn label={t('pay')} tone="emerald" pending={pending} onClick={() => run(() => payRefundAction(radiationId, method, reference))} />
            </div>
          ) : (
            <p className="text-xs italic text-slate-400">{t('waitingCompta')}</p>
          )}
        </div>
      )}

      {/* Payé */}
      {refund.status === 'PAID' && (
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-emerald-700">
            {t('paidOn')} : <b>{money(amount)}</b>
            {refund.method && <> · {t(`methods.${refund.method}` as never)}</>}
            {refund.reference && <> · {refund.reference}</>}
          </p>
          <a href={`/api/admin/radiation/${radiationId}/refund-receipt.pdf`} target="_blank" rel="noreferrer" className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700">
            {t('receipt')}
          </a>
        </div>
      )}

      {err && <p className="mt-2 text-xs text-red-700">{err}</p>}
    </section>
  );
}

function Btn({ label, onClick, pending, tone }: { label: string; onClick: () => void; pending: boolean; tone?: string }) {
  return (
    <button disabled={pending} onClick={onClick} className={`rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 ${tone === 'emerald' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-brand-600 hover:bg-brand-700'}`}>{label}</button>
  );
}
