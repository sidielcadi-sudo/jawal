'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import type { PaperProposal } from '@/lib/exam-blueprint';
import type { ScheduleConflict } from '@/lib/exam-schedule';
import { savePlanningAction } from './actions';

/**
 * Planificateur d'épreuves : un vivier à gauche, une grille jours × créneaux
 * à droite, et du glisser-déposer entre les deux.
 *
 * La mutualisation est visible à l'œil : une épreuve commune porte la liste
 * des filières qu'elle couvre et une pastille verte. C'est ce qui permet de
 * voir d'un coup qu'un créneau reçoit une seule épreuve pour cinq filières
 * plutôt que cinq épreuves à surveiller séparément.
 */

type Placement = { date: string; startTime: string };

const DAY_MS = 86_400_000;

/** Jours ouvrés de la session, bornes incluses. */
function daysBetween(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  const start = new Date(`${startISO}T00:00:00Z`).getTime();
  const end = new Date(`${endISO}T00:00:00Z`).getTime();
  for (let t = start; t <= end && out.length < 60; t += DAY_MS) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

export function ExamPlanner({
  sessionId,
  proposals,
  ungroupedCount,
  tracksWithoutBlueprint,
  derivedTracks,
  minDate,
  maxDate,
  disabled,
}: {
  sessionId: string;
  proposals: PaperProposal[];
  /** Nombre d'épreuves sans mutualisation — sert à chiffrer le gain. */
  ungroupedCount: number;
  tracksWithoutBlueprint: string[];
  /** Filières sans maquette, dont les épreuves sont déduites des matières certificatives. */
  derivedTracks: string[];
  minDate: string;
  maxDate: string;
  disabled: boolean;
}) {
  const t = useTranslations('admin.exams.planner');
  const tp = useTranslations('admin.exams.papers');
  const tg = useTranslations('admin.exams.generate');
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [conflicts, setConflicts] = useState<ScheduleConflict[] | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  /** Créneaux quotidiens, réglables : l'établissement décide de ses horaires. */
  const [slots, setSlots] = useState<string[]>(['08:00', '14:00']);
  const [newSlot, setNewSlot] = useState('10:00');

  // Placement initial : les épreuves déjà créées sont posées sur leur créneau.
  const [placed, setPlaced] = useState<Record<string, Placement | null>>(() =>
    Object.fromEntries(
      proposals.map((p) => [
        p.key,
        p.existingDate && p.existingStartTime
          ? { date: p.existingDate, startTime: p.existingStartTime }
          : null,
      ]),
    ),
  );

  const days = useMemo(() => daysBetween(minDate, maxDate), [minDate, maxDate]);

  const pool = proposals.filter((p) => !placed[p.key]);
  const cellOf = (date: string, slot: string) =>
    proposals.filter((p) => placed[p.key]?.date === date && placed[p.key]?.startTime === slot);

  /** Épreuves posées qui n'existent pas encore, ou dont le créneau a bougé. */
  const dirty = proposals.filter((p) => {
    const pl = placed[p.key];
    if (!pl) return false;
    if (!p.existingPaperId) return true;
    return pl.date !== p.existingDate || pl.startTime !== p.existingStartTime;
  });

  function onDrop(date: string, slot: string, key: string | null) {
    const k = key || dragging;
    if (!k) return;
    setPlaced((cur) => ({ ...cur, [k]: { date, startTime: slot } }));
    setDragging(null);
    setHover(null);
  }

  function backToPool(key: string | null) {
    const k = key || dragging;
    if (!k) return;
    setPlaced((cur) => ({ ...cur, [k]: null }));
    setDragging(null);
    setHover(null);
  }

  function save() {
    setError('');
    setConflicts(null);
    start(async () => {
      const r = await savePlanningAction(
        sessionId,
        dirty.map((p) => ({
          paperId: p.existingPaperId,
          subjectId: p.subjectId,
          trackIds: p.trackIds,
          durationMin: p.durationMin,
          coefficient: p.coefficient,
          date: placed[p.key]!.date,
          startTime: placed[p.key]!.startTime,
        })),
      );
      if (r.ok) {
        router.refresh();
        return;
      }
      if (r.error === 'CONFLICT' && r.conflicts) {
        setConflicts(r.conflicts);
        router.refresh();
        return;
      }
      setError(r.error);
    });
  }

  if (disabled) return null;

  const card = (p: PaperProposal, inPool: boolean) => (
    <div
      key={p.key}
      draggable
      onDragStart={(e) => {
        // Firefox refuse de démarrer un glisser sans charge utile : on écrit la
        // clé même si l'état React suffit aux navigateurs Chromium.
        e.dataTransfer.setData('text/plain', p.key);
        e.dataTransfer.effectAllowed = 'move';
        setDragging(p.key);
      }}
      onDragEnd={() => setDragging(null)}
      className={`cursor-grab rounded-lg border px-2.5 py-1.5 text-xs shadow-sm transition-transform active:cursor-grabbing ${
        p.type === 'SPECIALITY'
          ? 'border-amber-300 border-s-4 border-s-amber-500 bg-amber-50'
          : 'border-slate-200 border-s-4 border-s-brand-500 bg-slate-50'
      } ${inPool ? '' : 'w-full'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-slate-900">{p.subjectLabel}</span>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
            p.type === 'SPECIALITY'
              ? 'bg-amber-200 text-amber-900'
              : p.paperGroup
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-slate-200 text-slate-700'
          }`}
        >
          {p.paperGroup && p.type !== 'SPECIALITY'
            ? t('common')
            : tg(`types.${p.type}` as never)}
        </span>
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
        <span className="tabular-nums">🕐 {fmt(p.durationMin)}</span>
        <span className="text-slate-300">|</span>
        <strong className="font-medium text-slate-700">{p.trackLabels.join(', ')}</strong>
        {p.trackIds.length > 1 && (
          <span className="rounded bg-emerald-100 px-1 text-[10px] font-medium text-emerald-800">
            ×{p.trackIds.length}
          </span>
        )}
      </div>
      {p.existingPaperId && (
        <div className="mt-0.5 text-[10px] text-emerald-700">{t('saved')}</div>
      )}
    </div>
  );

  return (
    <div className="grid gap-3 lg:grid-cols-[300px_1fr]">
      {/* ── Vivier ────────────────────────────────────────────────────── */}
      <aside
        onDragOver={(e) => {
          e.preventDefault();
          setHover('pool');
        }}
        onDragLeave={() => setHover(null)}
        onDrop={(e) => {
          e.preventDefault();
          backToPool(e.dataTransfer.getData('text/plain'));
        }}
        className={`rounded-2xl border bg-white p-3 ${
          hover === 'pool' ? 'border-brand-400 bg-brand-50/40' : 'border-brand-200'
        }`}
      >
        <h2 className="text-sm font-semibold text-brand-800">📋 {t('poolTitle')}</h2>
        <p className="mt-0.5 text-[11px] text-slate-500">{t('poolHint')}</p>
        {/* Le gain de la mutualisation, chiffré : c'est lui qui justifie le
            référentiel de sujets partagés. */}
        <p className="mt-1.5 rounded-lg bg-emerald-50 px-2 py-1 text-[11px] text-emerald-900">
          {tg('summary', {
            papers: proposals.length,
            ungrouped: ungroupedCount,
            saved: ungroupedCount - proposals.length,
            grouped: proposals.filter((p) => p.trackIds.length > 1).length,
          })}
        </p>
        {tracksWithoutBlueprint.length > 0 && (
          <p className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
            {tg('noBlueprint', { tracks: tracksWithoutBlueprint.join(', ') })}
          </p>
        )}
        {derivedTracks.length > 0 && (
          <p className="mt-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] text-sky-900">
            {tg('fromCertifying', { tracks: derivedTracks.join(', ') })}
          </p>
        )}
        <div className="mt-2 flex min-h-[120px] flex-col gap-1.5">
          {pool.map((p) => card(p, true))}
          {pool.length === 0 && (
            <p className="py-6 text-center text-xs text-slate-400">{t('poolEmpty')}</p>
          )}
        </div>
      </aside>

      {/* ── Grille jours × créneaux ───────────────────────────────────── */}
      <div className="rounded-2xl border border-brand-200 bg-white p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-brand-800">🗓 {t('gridTitle')}</h2>
            <p className="text-[11px] text-slate-500">
              {t('gridHint', { placed: proposals.length - pool.length, total: proposals.length })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="time"
              value={newSlot}
              onChange={(e) => setNewSlot(e.target.value)}
              className="rounded border border-slate-300 px-2 py-1 text-xs"
            />
            <button
              type="button"
              onClick={() =>
                setSlots((cur) => (cur.includes(newSlot) ? cur : [...cur, newSlot].sort()))
              }
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              + {t('addSlot')}
            </button>
            <button
              type="button"
              disabled={pending || dirty.length === 0}
              onClick={save}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-40"
            >
              💾 {pending ? tp('saving') : t('save', { count: dirty.length })}
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {days.map((date) => (
            <div key={date} className="overflow-hidden rounded-xl border border-slate-200">
              <div className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-brand-800">
                {new Date(`${date}T00:00:00`).toLocaleDateString(locale, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </div>
              {slots.map((slot) => {
                const items = cellOf(date, slot);
                const id = `${date}|${slot}`;
                return (
                  <div key={slot} className="grid grid-cols-[110px_1fr] border-b border-slate-100 last:border-b-0">
                    <div className="flex flex-col justify-center border-e border-slate-100 bg-slate-50/60 px-3 py-2 text-[11px] font-semibold text-slate-500">
                      <span className="tabular-nums text-brand-700">{slot}</span>
                      {items.length > 0 && (
                        <span className="text-slate-400">
                          {t('slotCount', { count: items.length })}
                        </span>
                      )}
                    </div>
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setHover(id);
                      }}
                      onDragLeave={() => setHover((h) => (h === id ? null : h))}
                      onDrop={(e) => {
                        e.preventDefault();
                        onDrop(date, slot, e.dataTransfer.getData('text/plain'));
                      }}
                      className={`flex min-h-[64px] flex-wrap content-start gap-1.5 border-2 border-dashed p-2 ${
                        hover === id ? 'border-brand-400 bg-brand-50/50' : 'border-transparent'
                      }`}
                    >
                      {items.map((p) => (
                        <div key={p.key} className="w-full max-w-xs">
                          {card(p, false)}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
        {conflicts && conflicts.length > 0 && (
          <div className="mt-3 rounded-xl border border-red-300 bg-red-50 p-3">
            <p className="text-sm font-semibold text-red-900">⛔ {tg('partial')}</p>
            <ul className="mt-1.5 space-y-1 text-xs text-red-900">
              {conflicts.map((c, i) => (
                <li key={`${c.paperId}-${i}`}>
                  <strong>{c.subjectLabel}</strong> —{' '}
                  {new Date(c.date).toLocaleDateString(locale)} {c.startTime} ·{' '}
                  {c.sharedTracks.join(', ')}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/** 240 → « 4h », 150 → « 2h30 ». */
function fmt(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}
