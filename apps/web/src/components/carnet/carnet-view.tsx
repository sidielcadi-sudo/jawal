'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { addCarnetEntryAction, deleteCarnetEntryAction } from './actions';

type Entry = {
  id: string;
  type: string;
  content: string;
  occurredAt: string; // ISO
  authorName: string;
  authorRole: string;
  className: string | null;
  subjectLabel: string | null;
};
type Event = {
  id: string;
  date: string; // ISO
  category: string;
  className: string;
  justifStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
};

// Sections affichées (type d'entrée associé).
const SECTIONS = ['OBSERVATION', 'ENCOURAGEMENT', 'DEFAUT_CARNET', 'REMARQUE_DISCIPLINAIRE'] as const;

export function CarnetView({
  studentId,
  entries,
  events,
  allowedTypes,
  canDelete,
  locale,
}: {
  studentId: string;
  entries: Entry[];
  events: Event[];
  allowedTypes: string[];
  canDelete: boolean;
  locale: string;
}) {
  const t = useTranslations('carnet');
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div className="space-y-6">
      {SECTIONS.map((type) => (
        <Section
          key={type}
          type={type}
          studentId={studentId}
          entries={entries.filter((e) => e.type === type)}
          canAdd={allowedTypes.includes(type)}
          canDelete={canDelete}
          fmt={fmt}
          t={t}
        />
      ))}

      {/* Événements signalés dans les feuilles d'appel (dérivés, lecture seule) */}
      <section className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
          {t('eventsTitle')}
        </div>
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-2 text-start">{t('col.date')}</th>
              <th className="px-4 py-2 text-start">{t('col.class')}</th>
              <th className="px-4 py-2 text-start">{t('col.event')}</th>
              <th className="px-4 py-2 text-start">{t('col.justif')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {events.map((ev) => (
              <tr key={ev.id}>
                <td className="px-4 py-2 text-xs text-slate-600">{fmt(ev.date)}</td>
                <td className="px-4 py-2 text-xs text-slate-600">{ev.className}</td>
                <td className="px-4 py-2">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">
                    {t(`eventCat.${ev.category}`)}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs">
                  {ev.justifStatus ? (
                    <span
                      className={
                        ev.justifStatus === 'APPROVED'
                          ? 'text-emerald-700'
                          : ev.justifStatus === 'REJECTED'
                            ? 'text-red-700'
                            : 'text-amber-700'
                      }
                    >
                      {t(`justif.${ev.justifStatus}`)}
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-xs text-slate-400">
                  {t('noEvent')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Section({
  type,
  studentId,
  entries,
  canAdd,
  canDelete,
  fmt,
  t,
}: {
  type: string;
  studentId: string;
  entries: Entry[];
  canAdd: boolean;
  canDelete: boolean;
  fmt: (iso: string) => string;
  t: (k: string, v?: Record<string, string>) => string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  function submit() {
    if (text.trim().length === 0) return;
    setError('');
    const fd = new FormData();
    fd.set('studentId', studentId);
    fd.set('type', type);
    fd.set('content', text);
    start(async () => {
      const r = await addCarnetEntryAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setText('');
      setAdding(false);
      router.refresh();
    });
  }

  function remove(id: string) {
    if (!confirm(t('confirmDelete'))) return;
    start(async () => {
      const r = await deleteCarnetEntryAction(id);
      if (r.ok) router.refresh();
    });
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
        {t(`sections.${type}`)}
      </div>

      {canAdd && (
        <div className="border-b border-slate-100 px-4 py-2">
          {adding ? (
            <div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={2}
                autoFocus
                placeholder={t('placeholder')}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setText('');
                  }}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                >
                  {t('cancel')}
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={pending}
                  className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {pending ? t('saving') : t('save')}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 text-sm text-brand-700 hover:underline"
            >
              <span className="text-lg leading-none">＋</span> {t(`add.${type}`)}
            </button>
          )}
        </div>
      )}

      <table className="w-full text-sm">
        <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="w-28 px-4 py-2 text-start">{t('col.date')}</th>
            <th className="w-48 px-4 py-2 text-start">{t('col.author')}</th>
            <th className="px-4 py-2 text-start">{t('col.content')}</th>
            {canDelete && <th className="w-10 px-2 py-2" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {entries.map((e) => (
            <tr key={e.id}>
              <td className="px-4 py-2 align-top text-xs text-slate-600">{fmt(e.occurredAt)}</td>
              <td className="px-4 py-2 align-top text-xs text-slate-600">{e.authorName}</td>
              <td className="px-4 py-2 align-top text-slate-800">{e.content}</td>
              {canDelete && (
                <td className="px-2 py-2 align-top text-end">
                  <button
                    type="button"
                    onClick={() => remove(e.id)}
                    className="text-xs text-slate-300 hover:text-red-600"
                    title={t('delete')}
                  >
                    ✕
                  </button>
                </td>
              )}
            </tr>
          ))}
          {entries.length === 0 && (
            <tr>
              <td colSpan={canDelete ? 4 : 3} className="px-4 py-4 text-center text-xs text-slate-400">
                {t('empty')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
