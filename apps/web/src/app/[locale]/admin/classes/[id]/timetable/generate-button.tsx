'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { generateTimetableAction } from './generate-actions';

type GenerateResult =
  | {
      ok: true;
      data: {
        status: string;
        message: string;
        placed: number;
        unplaced: Array<{
          subject: string;
          requestedHours: number;
          placedHours: number;
          reason: string;
        }>;
        solverTimeMs: number;
      };
    }
  | { ok: false; error: string };

export function GenerateButton({ classId }: { classId: string }) {
  const t = useTranslations('admin.timetable.generate');
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<GenerateResult | null>(null);

  const onConfirm = () => {
    setResult(null);
    setConfirmOpen(false);
    startTransition(async () => {
      const res = await generateTimetableAction(classId);
      setResult(res);
      if (res.ok) router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={pending}
        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {pending ? t('running') : `✨ ${t('button')}`}
      </button>

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-slate-700">
              ⚠ {t('confirmTitle')}
            </h3>
            <p className="mt-2 text-xs text-slate-600">{t('confirmBody')}</p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-sm hover:bg-slate-50"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
              >
                {t('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setResult(null)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5"
            onClick={(e) => e.stopPropagation()}
          >
            {result.ok ? (
              <>
                <h3 className="text-sm font-semibold text-slate-700">
                  {result.data.status === 'OPTIMAL' || result.data.status === 'FEASIBLE'
                    ? `✅ ${t('resultOk')}`
                    : `⚠ ${t('resultPartial')}`}
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  {result.data.message}
                  <span className="ms-2 text-xs text-slate-400">
                    ({result.data.solverTimeMs} ms)
                  </span>
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {t('placedCount', { count: result.data.placed })}
                </p>

                {result.data.unplaced.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-xs font-semibold uppercase text-amber-700">
                      {t('unplacedHeader', { count: result.data.unplaced.length })}
                    </h4>
                    <ul className="mt-2 space-y-2">
                      {result.data.unplaced.map((u, i) => (
                        <li
                          key={i}
                          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs"
                        >
                          <div className="font-medium text-slate-900">
                            {u.subject}{' '}
                            <span className="text-slate-500">
                              ({u.placedHours}/{u.requestedHours} h)
                            </span>
                          </div>
                          <div className="mt-0.5 text-slate-600">{u.reason}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <>
                <h3 className="text-sm font-semibold text-red-700">
                  ❌ {t('resultError')}
                </h3>
                <p className="mt-2 text-sm text-red-800">{result.error}</p>
              </>
            )}

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setResult(null)}
                className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
              >
                {t('close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
