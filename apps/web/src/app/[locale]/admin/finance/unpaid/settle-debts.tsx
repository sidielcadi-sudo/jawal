'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { recordPaymentAction } from '@/app/[locale]/admin/persons/[id]/finance/actions';
import type { WaiveYear } from './waive-debts';

const METHODS = ['CASH', 'CHEQUE', 'TRANSFER', 'CMI', 'OTHER'] as const;

/**
 * Encaissement depuis l'écran de recouvrement.
 *
 * Le pendant vert d'« Effacer » : mêmes lignes, même geste de sélection, mais
 * l'argent rentre au lieu d'être abandonné. C'est le cas courant — on relance
 * une famille, elle paie, et l'agent doit pouvoir le saisir sans passer par la
 * fiche de chaque élève.
 *
 * Chaque ligne cochée est réglée pour son **reliquat exact**. Un versement
 * partiel reste du ressort de la fiche élève : ici on solde, et le total est
 * annoncé avant validation.
 */
export function SettleDebtsButton({
  studentName,
  years,
  currency,
}: {
  studentName: string;
  years: WaiveYear[];
  currency: string;
}) {
  const t = useTranslations('admin.finance.unpaid');
  const ts = useTranslations('admin.finance.unpaid.settle');
  const tMethod = useTranslations('admin.finance.methods');
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState<(typeof METHODS)[number]>('CASH');
  const [reference, setReference] = useState('');
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));

  const fmt = (n: number) =>
    n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const byId = useMemo(
    () => new Map(years.flatMap((y) => y.items.map((it) => [it.id, it] as const))),
    [years],
  );
  const total = useMemo(
    () => [...selected].reduce((s, id) => s + (byId.get(id)?.remaining ?? 0), 0),
    [selected, byId],
  );

  function toggle(id: string) {
    setError('');
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleYear(y: WaiveYear) {
    const ids = y.items.map((it) => it.id);
    const allOn = ids.every((id) => selected.has(id));
    setError('');
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (allOn) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  function submit() {
    setError('');
    if (selected.size === 0) {
      setError(ts('selectionRequired'));
      return;
    }
    start(async () => {
      // Une échéance à la fois : l'action existante encaisse par échéance et
      // passe l'écriture comptable correspondante. Un échec s'arrête net et
      // annonce ce qui a déjà été encaissé — ne rien dire laisserait l'agent
      // ressaisir des règlements déjà passés.
      let done = 0;
      for (const id of selected) {
        const it = byId.get(id);
        if (!it) continue;
        const fd = new FormData();
        fd.set('installmentId', id);
        fd.set('amount', String(it.remaining));
        fd.set('method', method);
        if (reference.trim()) fd.set('reference', reference.trim());
        fd.set('paidAt', paidAt);
        const r = await recordPaymentAction(fd);
        if (!r.ok) {
          setError(
            done > 0 ? ts('partial', { done, error: r.error }) : r.error,
          );
          router.refresh();
          return;
        }
        done += 1;
      }
      setSelected(new Set());
      setReference('');
      setOpen(false);
      router.refresh();
    });
  }

  function close() {
    setOpen(false);
    setSelected(new Set());
    setError('');
  }

  const previousYears = years.filter((y) => y.previous);
  const currentYears = years.filter((y) => !y.previous);

  const renderYear = (y: WaiveYear) => {
    const ids = y.items.map((it) => it.id);
    const allOn = ids.length > 0 && ids.every((id) => selected.has(id));
    return (
      <div key={y.yearId ?? 'none'} className="mt-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
              y.previous ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {y.yearLabel}
            {y.previous ? ` · ${t('previousTag')}` : ''}
          </span>
          <span className="text-xs tabular-nums text-red-700">
            {fmt(y.unpaid)} {currency}
          </span>
          <button
            type="button"
            onClick={() => toggleYear(y)}
            className="rounded-md border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
          >
            {allOn ? ts('unselectYear') : ts('selectYear')}
          </button>
        </div>
        <table className="mt-1.5 w-full text-xs">
          <thead className="text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-8 px-2 py-1" />
              <th className="px-2 py-1 text-start">{t('installment')}</th>
              <th className="px-2 py-1 text-start">{t('dueOn')}</th>
              <th className="px-2 py-1 text-end">{t('due')}</th>
              <th className="px-2 py-1 text-end">{t('paid')}</th>
              <th className="px-2 py-1 text-end">{t('remaining')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {y.items.map((it) => (
              <tr key={it.id} className={selected.has(it.id) ? 'bg-emerald-50' : undefined}>
                <td className="px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={selected.has(it.id)}
                    disabled={pending}
                    onChange={() => toggle(it.id)}
                    aria-label={it.label}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                </td>
                <td className="px-2 py-1.5 text-slate-800">{it.label}</td>
                <td className="px-2 py-1.5 text-slate-500">
                  {new Date(it.dueDate).toLocaleDateString(locale)}
                </td>
                <td className="px-2 py-1.5 text-end tabular-nums text-slate-700">
                  {fmt(it.amount)}
                </td>
                <td className="px-2 py-1.5 text-end tabular-nums text-emerald-700">
                  {fmt(it.paid)}
                </td>
                <td className="px-2 py-1.5 text-end font-semibold tabular-nums text-red-700">
                  {fmt(it.remaining)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const inputCls =
    'mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ms-1 inline-flex items-center rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
      >
        {ts('action')}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={close}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl bg-white text-start shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="overflow-y-auto p-5 pb-2">
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">
                  {ts('title')} — <span className="text-slate-600">{studentName}</span>
                </h3>
                <button
                  type="button"
                  onClick={close}
                  className="text-slate-400 hover:text-slate-700"
                >
                  ✕
                </button>
              </div>
              <p className="text-xs text-emerald-700">{ts('hint')}</p>

              {previousYears.length > 0 && (
                <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50/60 px-3 py-2">
                  <span className="text-sm font-semibold text-amber-900">
                    ⚠ {t('previousSection')}
                  </span>
                </div>
              )}
              {previousYears.map(renderYear)}

              {previousYears.length > 0 && currentYears.length > 0 && (
                <div className="mt-5 border-t border-slate-200 pt-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t('currentSection')}
                  </span>
                </div>
              )}
              {currentYears.map(renderYear)}
            </div>

            <div className="border-t border-slate-200 bg-slate-50/80 px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-slate-600">
                  {ts('selectedCount', { count: selected.size })}
                  {selected.size > 0 && (
                    <strong className="ms-2 tabular-nums text-emerald-700">
                      {fmt(total)} {currency}
                    </strong>
                  )}
                </span>
              </div>

              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <label className="block text-xs font-medium text-slate-700">
                  {ts('method')}
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value as (typeof METHODS)[number])}
                    disabled={selected.size === 0 || pending}
                    className={inputCls}
                  >
                    {METHODS.map((m) => (
                      <option key={m} value={m}>
                        {tMethod(m)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-slate-700">
                  {ts('paidAt')}
                  <input
                    type="date"
                    value={paidAt}
                    onChange={(e) => setPaidAt(e.target.value)}
                    disabled={selected.size === 0 || pending}
                    className={inputCls}
                  />
                </label>
                <label className="block text-xs font-medium text-slate-700">
                  {ts('reference')}
                  <input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder={ts('referencePlaceholder')}
                    disabled={selected.size === 0 || pending}
                    className={inputCls}
                  />
                </label>
              </div>

              {error && <p className="mt-1 text-xs text-red-700">{error}</p>}

              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={close}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                >
                  {t('cancel')}
                </button>
                <button
                  type="button"
                  disabled={pending || selected.size === 0}
                  onClick={submit}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
                >
                  {pending
                    ? ts('saving')
                    : ts('confirm', { amount: `${fmt(total)} ${currency}` })}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
