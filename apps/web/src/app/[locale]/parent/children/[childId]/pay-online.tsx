'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { initiateCmiPaymentAction } from './payment-actions';

type PayableFee = { id: string; label: string; remaining: number };

/**
 * Bloc « Payer en ligne » (CMI) du portail parent : sélection des reliquats
 * d'échéances, puis redirection vers la page de paiement CMI (formulaire signé
 * auto-soumis). Le règlement n'est enregistré qu'au retour du callback vérifié.
 */
export function PayOnline({
  childId,
  fees,
  currency,
  configured,
}: {
  childId: string;
  fees: PayableFee[];
  currency: string;
  configured: boolean;
}) {
  const t = useTranslations('parent.child.pay');
  const [pending, start] = useTransition();
  const [sel, setSel] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(fees.map((f) => [f.id, true])),
  );
  const [err, setErr] = useState('');

  if (fees.length === 0) return null;

  const selectedIds = fees.filter((f) => sel[f.id]).map((f) => f.id);
  const total = fees.filter((f) => sel[f.id]).reduce((s, f) => s + f.remaining, 0);

  function pay() {
    setErr('');
    if (selectedIds.length === 0) {
      setErr(t('selectOne'));
      return;
    }
    start(async () => {
      const r = await initiateCmiPaymentAction(childId, selectedIds);
      if (!r.ok) {
        setErr(r.notConfigured ? t('notConfigured') : r.error);
        return;
      }
      // Redirection vers CMI : formulaire caché auto-soumis.
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = r.action;
      for (const [k, v] of Object.entries(r.fields)) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = k;
        input.value = v;
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    });
  }

  const money = (n: number) => `${n.toLocaleString('fr')} ${currency}`;

  return (
    <section className="rounded-2xl border border-brand-100 bg-white p-5">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-700">{t('title')}</h2>
        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700">CMI</span>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">{t('subtitle')}</p>

      <ul className="mt-3 space-y-1.5">
        {fees.map((f) => (
          <li key={f.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2">
            <label className="flex min-w-0 items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={!!sel[f.id]}
                disabled={!configured || pending}
                onChange={(e) => setSel((m) => ({ ...m, [f.id]: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span className="truncate">{f.label}</span>
            </label>
            <span className="tabular-nums font-medium text-slate-800">{money(f.remaining)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-slate-600">
          {t('total')} : <b className="tabular-nums text-slate-900">{money(total)}</b>
        </span>
        <button
          type="button"
          onClick={pay}
          disabled={!configured || pending || total <= 0}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? t('redirecting') : t('payButton')}
        </button>
      </div>

      {!configured && <p className="mt-2 text-xs text-amber-700">{t('notConfiguredHint')}</p>}
      {err && <p className="mt-2 text-xs text-red-700">{err}</p>}
    </section>
  );
}
