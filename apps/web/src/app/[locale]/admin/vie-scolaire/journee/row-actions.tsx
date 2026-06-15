'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { setMotifAction, toggleRaAction, notifyAppelAction } from './actions';

export type Reason = { id: string; label: string; color: string | null };

const BAR: Record<string, string> = {
  cyan: 'bg-cyan-400',
  rose: 'bg-rose-400',
  blue: 'bg-blue-500',
  amber: 'bg-amber-400',
  green: 'bg-green-500',
  red: 'bg-red-500',
  purple: 'bg-purple-500',
  slate: 'bg-slate-300',
};

/** Case « RA » : régularise (ou annule) l'absence du record. */
export function RaCheckbox({ recordId, checked }: { recordId: string; checked: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <input
      type="checkbox"
      defaultChecked={checked}
      disabled={pending}
      className="h-4 w-4 cursor-pointer accent-brand-600 disabled:opacity-50"
      onChange={(e) => {
        const ra = e.target.checked;
        start(async () => {
          const r = await toggleRaAction({ recordId, ra });
          if (r.ok) router.refresh();
          else {
            // eslint-disable-next-line no-alert
            alert(r.error);
            router.refresh();
          }
        });
      }}
    />
  );
}

/**
 * Bouton « Notifier » : envoie à l'enseignant un message (interne + e-mail) lui
 * demandant de faire son appel. Désactivé si le prof n'a pas de compte.
 */
export function NotifyAppelButton({
  teacherUserId,
  classId,
  periodLabel,
  date,
}: {
  teacherUserId: string | null;
  classId: string;
  periodLabel: string;
  date: string;
}) {
  const t = useTranslations('admin.vieScolaire.board.appel');
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);

  if (!teacherUserId) {
    return <span className="text-xs text-slate-400">{t('noAccount')}</span>;
  }
  if (done) {
    return <span className="text-xs font-medium text-emerald-600">✓ {t('notified')}</span>;
  }
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await notifyAppelAction({ teacherUserId, classId, periodLabel, date });
          if (r.ok) setDone(true);
          // eslint-disable-next-line no-alert
          else alert(r.error);
        })
      }
      className="rounded-lg bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
    >
      {pending ? t('sending') : t('notify')}
    </button>
  );
}

/**
 * Bouton « Action » + popup « Sélectionner un motif d'absence » (liste des
 * AttendanceReason avec pastille de couleur, recherche, Valider).
 */
export function MotifPicker({
  recordId,
  reasons,
  currentReasonId,
}: {
  recordId: string;
  reasons: Reason[];
  currentReasonId: string | null;
}) {
  const t = useTranslations('admin.vieScolaire.board.motif');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(currentReasonId);
  const [pending, start] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? reasons.filter((r) => r.label.toLowerCase().includes(q)) : reasons;
  }, [query, reasons]);

  function validate() {
    if (!selected) {
      setOpen(false);
      return;
    }
    start(async () => {
      const r = await setMotifAction({ recordId, reasonId: selected });
      if (r.ok) {
        setOpen(false);
        router.refresh();
      } else {
        // eslint-disable-next-line no-alert
        alert(r.error);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setSelected(currentReasonId);
          setQuery('');
          setOpen(true);
        }}
        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
      >
        {t('action')}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-sm flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2">
              <h3 className="text-sm font-semibold text-slate-700">{t('title')}</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-600"
                aria-label={t('cancel')}
              >
                ✕
              </button>
            </div>

            <div className="border-b border-slate-100 px-3 py-2">
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('search')}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <ul className="flex-1 overflow-auto py-1">
              {filtered.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(r.id)}
                    className={`flex w-full items-center gap-2 px-4 py-1.5 text-start text-sm ${
                      selected === r.id ? 'bg-brand-100 text-brand-800' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className={`h-4 w-4 shrink-0 rounded-sm border border-slate-300 ${BAR[r.color ?? 'slate']}`} />
                    <span className="truncate">{r.label}</span>
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="px-4 py-3 text-center text-xs text-slate-400">{t('empty')}</li>
              )}
            </ul>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={validate}
                disabled={pending || !selected}
                className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {pending ? t('saving') : t('validate')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
