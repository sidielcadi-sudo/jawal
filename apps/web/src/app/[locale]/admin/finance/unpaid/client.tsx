'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { createReminderAction } from './actions';

type Reminder = { id: string; note: string; createdAt: string; author: string | null };

export function RelanceButton({
  studentId,
  studentName,
  reminders,
}: {
  studentId: string;
  studentName: string;
  reminders: Reminder[];
}) {
  const t = useTranslations('admin.finance.unpaid');
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState('');

  function submit(fd: FormData) {
    setError('');
    fd.set('studentId', studentId);
    start(async () => {
      const r = await createReminderAction(fd);
      if (!r.ok) setError(r.error ?? 'Erreur');
      else {
        (document.getElementById(`relance-form-${studentId}`) as HTMLFormElement)?.reset();
        router.refresh();
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700"
      >
        {t('relance')}
        {reminders.length > 0 && (
          <span className="inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-white/25 px-1 text-[10px] font-semibold">
            {reminders.length}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                {t('relanceTitle')} — <span className="text-slate-600">{studentName}</span>
              </h3>
              <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700">
                ✕
              </button>
            </div>

            {/* Historique des relances */}
            <div className="mb-4 max-h-52 space-y-2 overflow-y-auto">
              {reminders.length === 0 ? (
                <p className="text-xs text-slate-400">{t('relanceEmpty')}</p>
              ) : (
                reminders.map((r) => (
                  <div key={r.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                    <div className="text-xs text-slate-400">
                      {new Date(r.createdAt).toLocaleString(locale)}
                      {r.author ? ` · ${r.author}` : ''}
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">{r.note}</p>
                  </div>
                ))
              )}
            </div>

            {/* Nouvelle relance */}
            <form id={`relance-form-${studentId}`} action={submit} className="space-y-2">
              {error && <div className="text-xs text-red-600">{error}</div>}
              <textarea
                name="note"
                required
                rows={3}
                maxLength={2000}
                placeholder={t('relancePlaceholder')}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {t('relanceSave')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
