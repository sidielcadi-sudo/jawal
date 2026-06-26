'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { submitParentJustificationAction } from './justify-actions';

type Reason = { id: string; label: string };

/**
 * Bouton « Justifier » + popup (motif, justificatif, commentaire) côté parent.
 * À la validation, soumet une justification PENDING à la Vie scolaire.
 */
export function JustifyButton({
  recordId,
  reasons,
  dateLabel,
  className,
}: {
  recordId: string;
  reasons: Reason[];
  dateLabel: string;
  className: string;
}) {
  const t = useTranslations('parent.child.attendance.justify');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reasonId, setReasonId] = useState('');
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);

  function submit() {
    if (!reasonId) {
      setError(t('reasonRequired'));
      return;
    }
    setError('');
    const fd = new FormData();
    fd.set('attendanceRecordId', recordId);
    fd.set('reasonId', reasonId);
    if (commentRef.current?.value) fd.set('comment', commentRef.current.value);
    const f = fileRef.current?.files?.[0];
    if (f) fd.set('file', f);
    start(async () => {
      const r = await submitParentJustificationAction(fd);
      if (r.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setReasonId('');
          setFileName('');
          setError('');
          setOpen(true);
        }}
        className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-700"
      >
        {t('button')}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative px-5 pt-5 text-center">
              <button
                type="button"
                onClick={() => !pending && setOpen(false)}
                className="absolute end-3 top-3 text-slate-400 hover:text-slate-600"
                aria-label={t('cancel')}
              >
                ✕
              </button>
              <h3 className="text-base font-semibold text-slate-800">{t('title')}</h3>
              <p className="mt-1 text-sm text-slate-600">{dateLabel}</p>
              <p className="text-xs text-slate-400">{className}</p>
            </div>

            <div className="space-y-3 px-5 py-4">
              <label className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2">
                <span className="text-brand-600">☰</span>
                <select
                  value={reasonId}
                  onChange={(e) => setReasonId(e.target.value)}
                  className="w-full bg-transparent text-sm text-slate-700 focus:outline-none"
                >
                  <option value="">{t('chooseReason')}</option>
                  {reasons.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex w-full items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-start text-sm text-slate-600 hover:bg-slate-50"
              >
                <span className="text-brand-600">📎</span>
                <span className="truncate">{fileName || t('uploadFile')}</span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,image/*"
                className="hidden"
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')}
              />

              <textarea
                ref={commentRef}
                rows={3}
                placeholder={t('comment')}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />

              {error && <p className="text-xs text-red-700">{error}</p>}
            </div>

            <div className="flex justify-center gap-2 border-t border-slate-100 px-5 py-3">
              <button
                type="button"
                onClick={() => !pending && setOpen(false)}
                className="rounded-lg bg-sky-100 px-4 py-1.5 text-sm font-medium text-sky-700 hover:bg-sky-200"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending || !reasonId}
                className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {pending ? t('sending') : t('validate')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
