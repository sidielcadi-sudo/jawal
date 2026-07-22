'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { saveCompetencyAssessmentsAction } from './actions';

type Mastery = { id: string; code: string; label: string; value: number; color: string };
type Row = { studentId: string; name: string; masteryLevelId: string | null; othersCount: number };

/**
 * Grille de saisie : une compétence × toute la classe.
 * Les paliers sont des boutons (pas un dropdown) pour rester rapide au doigt,
 * et une barre de saisie rapide applique un palier à tous les élèves.
 */
export function CompetencyGrid({
  nodeId,
  periodId,
  scale,
  initial,
}: {
  nodeId: string;
  periodId: string;
  scale: Mastery[];
  initial: Row[];
}) {
  const t = useTranslations('enseignant.competences');
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const setLevel = (studentId: string, masteryLevelId: string | null) =>
    setRows((prev) =>
      prev.map((r) => (r.studentId === studentId ? { ...r, masteryLevelId } : r)),
    );

  const applyAll = (masteryLevelId: string) =>
    setRows((prev) => prev.map((r) => ({ ...r, masteryLevelId })));

  const save = () =>
    start(async () => {
      setMsg(null);
      const res = await saveCompetencyAssessmentsAction(
        nodeId,
        periodId,
        rows.map((r) => ({ studentId: r.studentId, masteryLevelId: r.masteryLevelId })),
      );
      if (!res.ok) return setMsg({ ok: false, text: res.error });
      setMsg({ ok: true, text: t('saved', { count: res.saved ?? 0 }) });
      router.refresh();
    });

  const filled = rows.filter((r) => r.masteryLevelId).length;

  return (
    <div className="rounded-2xl border border-brand-200 bg-white">
      {/* Saisie rapide */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('quickFill')}</span>
        {scale.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => applyAll(m.id)}
            className="rounded-lg border px-2 py-1 text-xs font-medium transition hover:opacity-80"
            style={{ borderColor: m.color, color: m.color }}
          >
            {m.label}
          </button>
        ))}
        <span className="ms-auto text-xs text-slate-500">
          {t('coverage', { filled, total: rows.length })}
        </span>
      </div>

      <ul className="divide-y divide-slate-100">
        {rows.map((r) => (
          <li key={r.studentId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <span className="text-sm font-medium text-slate-800">{r.name}</span>
              {r.othersCount > 0 && (
                <span className="ms-2 text-[11px] text-slate-400">
                  {t('othersEvaluated', { count: r.othersCount })}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {scale.map((m) => {
                const on = r.masteryLevelId === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setLevel(r.studentId, on ? null : m.id)}
                    aria-pressed={on}
                    title={m.label}
                    className="rounded-lg border px-2.5 py-1 text-xs font-semibold transition"
                    style={
                      on
                        ? { backgroundColor: m.color, borderColor: m.color, color: '#fff' }
                        : { borderColor: '#e2e8f0', color: '#64748b' }
                    }
                  >
                    {m.code}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="px-4 py-10 text-center text-sm text-slate-400">{t('noStudent')}</li>
        )}
      </ul>

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-4 py-3">
        <button
          type="button"
          disabled={pending || rows.length === 0}
          onClick={save}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? t('saving') : t('save')}
        </button>
        {msg && (
          <span className={`text-xs ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{msg.text}</span>
        )}
      </div>
    </div>
  );
}
