'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  listMyAlertsAction,
  markAlertReadAction,
  markAllAlertsReadAction,
  type StaffAlertDTO,
} from './alerts-actions';

export function AlertsBell({
  locale,
  initialAlerts,
  initialUnread,
}: {
  locale: string;
  initialAlerts: StaffAlertDTO[];
  initialUnread: number;
}) {
  const t = useTranslations('admin.alerts');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState(initialAlerts);
  const [unread, setUnread] = useState(initialUnread);
  const [, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  // Fermeture au clic extérieur.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  async function refresh() {
    const r = await listMyAlertsAction();
    setAlerts(r.alerts);
    setUnread(r.unread);
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) void refresh();
  }

  function openAlert(a: StaffAlertDTO) {
    setOpen(false);
    start(async () => {
      if (!a.read) {
        await markAlertReadAction(a.id);
        setUnread((u) => Math.max(0, u - 1));
      }
      // La cible vient de la base (StaffAlert.link) : c'est une chaîne libre,
      // pas une route connue à la compilation. `typedRoutes` exige donc un
      // cast explicite — la validité de l'URL est garantie côté producteur
      // de l'alerte, pas par le type.
      if (a.link) {
        const href = (a.link.startsWith('/') ? a.link : `/${locale}/admin/${a.link}`) as Route;
        router.push(href);
      }
      else router.refresh();
    });
  }

  function markAll() {
    start(async () => {
      await markAllAlertsReadAction();
      setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
      setUnread(0);
    });
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={t('title')}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-[1.05rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute end-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-brand-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <span className="text-sm font-semibold text-slate-700">{t('title')}</span>
            {unread > 0 && (
              <button type="button" onClick={markAll} className="text-[11px] font-medium text-brand-700 hover:underline">
                {t('markAll')}
              </button>
            )}
          </div>
          <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
            {alerts.length === 0 && <li className="px-4 py-8 text-center text-xs text-slate-400">{t('empty')}</li>}
            {alerts.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => openAlert(a)}
                  className={`flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-start transition-colors hover:bg-slate-50 ${a.read ? '' : 'bg-brand-50/50'}`}
                >
                  <span className="flex w-full items-center gap-2">
                    {!a.read && <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" />}
                    <span className="flex-1 truncate text-[13px] font-medium text-slate-800">{a.title}</span>
                  </span>
                  {a.body && <span className="line-clamp-2 text-[11px] text-slate-500">{a.body}</span>}
                  <span className="text-[10px] text-slate-400">{new Date(a.createdAt).toLocaleString(locale)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
