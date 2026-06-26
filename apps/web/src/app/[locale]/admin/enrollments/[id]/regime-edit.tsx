'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { updateRegimeTransportAction } from './regime-actions';

type EditableFee = { feeId: string; label: string; currentCount: number; locked: boolean };

export function RegimeEdit({
  enrollmentId,
  regime,
  usesTransport,
  fees = [],
}: {
  enrollmentId: string;
  regime: 'EXTERNE' | 'DEMI_PENSIONNAIRE' | 'INTERNE' | null;
  usesTransport: boolean;
  fees?: EditableFee[];
}) {
  const tForm = useTranslations('admin.persons.form');
  const t = useTranslations('admin.enrollments.detail.regimeEdit');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [r, setR] = useState<string>(regime ?? '');
  const [transport, setTransport] = useState(usesTransport);
  const [counts, setCounts] = useState<Record<string, number>>(
    () => Object.fromEntries(fees.map((f) => [f.feeId, f.currentCount])),
  );
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function submit() {
    setMsg(null);
    const feeCounts = fees
      .filter((f) => !f.locked && counts[f.feeId] !== f.currentCount)
      .map((f) => ({ feeId: f.feeId, count: counts[f.feeId]! }));
    start(async () => {
      const res = await updateRegimeTransportAction({
        enrollmentId,
        regime: r,
        usesTransport: transport,
        feeCounts,
      });
      if (!res.ok) return setMsg({ ok: false, text: res.error });
      setMsg({ ok: true, text: res.message });
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setMsg(null);
        }}
        className="rounded-lg border border-brand-300 bg-white px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
      >
        ✎ {t('button')}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900">{t('title')}</h3>
            <p className="mt-1 text-xs text-amber-700">{t('warning')}</p>

            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="text-xs font-medium text-slate-600">{tForm('regime.label')}</span>
                <select
                  value={r}
                  onChange={(e) => setR(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">{tForm('regime.none')}</option>
                  <option value="EXTERNE">{tForm('regime.EXTERNE')}</option>
                  <option value="DEMI_PENSIONNAIRE">{tForm('regime.DEMI_PENSIONNAIRE')}</option>
                  <option value="INTERNE">{tForm('regime.INTERNE')}</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={transport}
                  onChange={(e) => setTransport(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                {tForm('usesTransport')}
              </label>

              {fees.length > 0 && (
                <div className="border-t border-slate-100 pt-3">
                  <div className="mb-1.5 text-xs font-medium text-slate-600">{t('feesTitle')}</div>
                  <ul className="space-y-1.5">
                    {fees.map((f) => (
                      <li key={f.feeId} className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 flex-1 truncate text-slate-700">{f.label}</span>
                        <span className="flex items-center gap-1">
                          <input
                            type="number"
                            min={1}
                            max={24}
                            value={counts[f.feeId] ?? f.currentCount}
                            disabled={f.locked}
                            onChange={(e) =>
                              setCounts((c) => ({ ...c, [f.feeId]: Math.max(1, Number(e.target.value) || 1) }))
                            }
                            className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-center text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
                          />
                          <span className="text-[11px] text-slate-400">{t('installments')}</span>
                          {f.locked && <span title={t('feeLocked')}>🔒</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-[11px] text-slate-400">{t('feesHint')}</p>
                </div>
              )}
            </div>

            {msg && (
              <p className={`mt-3 text-xs ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>{msg.text}</p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                {t('close')}
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {pending ? '…' : t('save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
