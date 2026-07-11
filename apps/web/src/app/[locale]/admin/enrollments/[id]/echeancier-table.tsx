'use client';

import { Fragment, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { recordInstallmentPaymentAction, recordGroupPaymentAction } from '../admission-actions';

export type InstallmentRow = {
  id: string;
  label: string;
  feeType: string;
  dueDate: string;
  amount: number;
  /** Total déjà versé sur cette échéance (pour afficher le reste dû). */
  paid: number;
  status: 'PENDING' | 'PARTIAL' | 'PAID' | 'CANCELLED';
  method: string | null;
  reference: string | null;
};

const METHODS = ['CASH', 'CHEQUE', 'TRANSFER', 'CMI', 'OTHER'] as const;

export function EcheancierTable({
  rows,
  currency,
}: {
  rows: InstallmentRow[];
  currency: string;
}) {
  const t = useTranslations('admin.enrollments.admission');
  if (rows.length === 0) return null;

  // Regroupe les échéances par date d'exigibilité (fin de mois / trimestre…),
  // avec une ligne de total par date.
  const groups: { dueDate: string; rows: InstallmentRow[] }[] = [];
  for (const r of rows) {
    const g = groups.find((x) => x.dueDate === r.dueDate);
    if (g) g.rows.push(r);
    else groups.push({ dueDate: r.dueDate, rows: [r] });
  }

  let n = 0;
  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="bg-brand-600 px-5 py-2.5">
        <h2 className="text-sm font-semibold text-white">{t('echeancier.title')}</h2>
      </div>
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-2 text-start">{t('echeancier.n')}</th>
            <th className="px-4 py-2 text-start">{t('echeancier.due')}</th>
            <th className="px-4 py-2 text-start">{t('echeancier.feeType')}</th>
            <th className="px-4 py-2 text-end">{t('echeancier.amount')}</th>
            <th className="px-4 py-2 text-start">{t('echeancier.method')}</th>
            <th className="px-4 py-2 text-start">{t('echeancier.status')}</th>
            <th className="px-4 py-2 text-end">{t('echeancier.action')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {groups.map((g) => {
            // « Total dû » = reste à payer (montant − déjà versé), hors annulées.
            // Une échéance soldée ou la part déjà réglée d'une échéance partielle
            // ne comptent plus dans le dû.
            const subtotal = g.rows.reduce(
              (s, r) => (r.status === 'CANCELLED' ? s : s + Math.max(0, r.amount - r.paid)),
              0,
            );
            const unpaidIds = g.rows
              .filter((r) => r.status !== 'PAID' && r.status !== 'CANCELLED')
              .map((r) => r.id);
            return (
              <Fragment key={g.dueDate}>
                {g.rows.map((r) => {
                  n += 1;
                  return <Row key={r.id} n={n} row={r} currency={currency} t={t} />;
                })}
                <TotalRow
                  dueDate={g.dueDate}
                  subtotal={subtotal}
                  unpaidIds={unpaidIds}
                  currency={currency}
                  t={t}
                />
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function Row({
  n,
  row,
  currency,
  t,
}: {
  n: number;
  row: InstallmentRow;
  currency: string;
  t: (k: string) => string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const [err, setErr] = useState('');

  const paid = row.status === 'PAID';
  const cancelled = row.status === 'CANCELLED';
  const remaining = Math.max(0, row.amount - row.paid);
  const isPartial = !paid && !cancelled && row.paid > 0;

  function save() {
    setErr('');
    start(async () => {
      const res = await recordInstallmentPaymentAction(
        row.id,
        method as (typeof METHODS)[number],
        reference || undefined,
      );
      if (!res.ok) return setErr(res.error);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <tr className={paid ? 'bg-emerald-50/30' : ''}>
        <td className="px-4 py-2 font-medium text-brand-700">{n}</td>
        <td className="px-4 py-2 text-slate-700">{new Date(row.dueDate).toLocaleDateString('fr')}</td>
        <td className="px-4 py-2 text-slate-600">{row.feeType}</td>
        <td className="px-4 py-2 text-end font-medium tabular-nums">
          {row.amount.toFixed(2)} {currency}
          {isPartial && (
            <div className="text-[11px] font-normal text-amber-700">
              {t('echeancier.remaining')} {remaining.toFixed(2)} {currency}
            </div>
          )}
        </td>
        <td className="px-4 py-2 text-slate-600">
          {row.method ? t(`method.${row.method}`) : '—'}
        </td>
        <td className="px-4 py-2">
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              paid
                ? 'bg-emerald-100 text-emerald-700'
                : cancelled
                  ? 'bg-slate-100 text-slate-500'
                  : isPartial
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-amber-100 text-amber-800'
            }`}
          >
            {paid
              ? `✓ ${t('echeancier.paid')}`
              : cancelled
                ? t('echeancier.cancelled')
                : isPartial
                  ? t('echeancier.partial')
                  : t('echeancier.pending')}
          </span>
        </td>
        <td className="px-4 py-2 text-end">
          {paid ? (
            <span className="text-xs text-emerald-700">
              {row.reference ? `${t('echeancier.ref')} ${row.reference}` : '✓'}
            </span>
          ) : cancelled ? (
            <span className="text-xs text-slate-400">—</span>
          ) : (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="rounded bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700"
            >
              {t('echeancier.record')}
            </button>
          )}
        </td>
      </tr>
      {open && !paid && !cancelled && (
        <tr className="bg-slate-50">
          <td colSpan={7} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {t(`method.${m}`)}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={
                  method === 'CHEQUE' ? t('echeancier.chequeRef') : t('echeancier.reference')
                }
                className="w-56 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                disabled={pending}
                onClick={save}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {t('echeancier.confirm')}
              </button>
              {method === 'CHEQUE' && (
                <span className="text-[11px] text-slate-400">{t('echeancier.chequeHint')}</span>
              )}
              {err && <span className="text-xs text-red-700">{err}</span>}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/** Ligne « Total dû le … » avec bouton d'encaissement groupé (une fois pour tout). */
function TotalRow({
  dueDate,
  subtotal,
  unpaidIds,
  currency,
  t,
}: {
  dueDate: string;
  subtotal: number;
  unpaidIds: string[];
  currency: string;
  t: (k: string, v?: Record<string, string>) => string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const [err, setErr] = useState('');

  function save() {
    setErr('');
    start(async () => {
      const res = await recordGroupPaymentAction(
        unpaidIds,
        method as (typeof METHODS)[number],
        reference || undefined,
      );
      if (!res.ok) return setErr(res.error);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <tr className="border-y border-brand-200 bg-brand-50 text-xs font-bold text-brand-800">
        <td className="px-4 py-1.5" colSpan={3}>
          {t('echeancier.dueTotal', { date: new Date(dueDate).toLocaleDateString('fr') })}
        </td>
        <td className="px-4 py-1.5 text-end tabular-nums">
          {subtotal.toFixed(2)} {currency}
        </td>
        <td className="px-4 py-1.5 text-end" colSpan={3}>
          {unpaidIds.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="rounded bg-brand-600 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-700"
            >
              {t('echeancier.recordAll')}
            </button>
          )}
        </td>
      </tr>
      {open && unpaidIds.length > 0 && (
        <tr className="bg-brand-50/60">
          <td colSpan={7} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {t(`method.${m}`)}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={method === 'CHEQUE' ? t('echeancier.chequeRef') : t('echeancier.reference')}
                className="w-56 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                disabled={pending}
                onClick={save}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {t('echeancier.confirmAll', { count: String(unpaidIds.length) })}
              </button>
              {err && <span className="text-xs text-red-700">{err}</span>}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
