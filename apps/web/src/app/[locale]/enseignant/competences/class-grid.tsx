'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { saveClassGridAction } from './actions';

type Mastery = { id: string; code: string; label: string; value: number; color: string };
type Column = { key: string; label: string; sublabel?: string | null; kind: 'academic' | 'aptitude'; nodeIds: string[] };
type Row = { studentId: string; name: string; values: Record<string, string | null> };

/**
 * Grille de saisie rapide de classe (un élève par ligne, une compétence /
 * aptitude par colonne). Chaque cellule = sélecteur à 4 pastilles (l'échelle).
 * Pour une aptitude, le niveau choisi s'applique à toutes ses facettes.
 */
export function ClassGrid({
  periodId,
  scale,
  columns,
  rows,
}: {
  periodId: string;
  scale: Mastery[];
  columns: Column[];
  rows: Row[];
}) {
  const t = useTranslations('enseignant.competences');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [query, setQuery] = useState('');
  const [hideApt, setHideApt] = useState(false);
  const [prefill, setPrefill] = useState(scale.find((m) => m.value === 2)?.id ?? scale[0]?.id ?? '');

  // État : `${studentId}|${columnKey}` → masteryLevelId | null.
  const initial = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const r of rows) for (const c of columns) m.set(`${r.studentId}|${c.key}`, r.values[c.key] ?? null);
    return m;
  }, [rows, columns]);
  const [vals, setVals] = useState<Map<string, string | null>>(() => new Map(initial));

  const colById = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);
  const shownCols = hideApt ? columns.filter((c) => c.kind === 'academic') : columns;
  const academic = columns.filter((c) => c.kind === 'academic');
  const aptitudes = columns.filter((c) => c.kind === 'aptitude');

  const filteredRows = rows.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase()));

  const setCell = (studentId: string, key: string, levelId: string | null) =>
    setVals((prev) => {
      const next = new Map(prev);
      const cur = next.get(`${studentId}|${key}`);
      next.set(`${studentId}|${key}`, cur === levelId ? null : levelId); // re-clic = annule
      return next;
    });

  const applyPrefill = () =>
    setVals((prev) => {
      const next = new Map(prev);
      for (const r of rows) for (const c of shownCols) next.set(`${r.studentId}|${c.key}`, prefill);
      return next;
    });

  const save = () =>
    start(async () => {
      setMsg(null);
      // N'envoie que les cellules modifiées.
      const cells: { studentId: string; nodeIds: string[]; masteryLevelId: string | null }[] = [];
      for (const r of rows) {
        for (const c of columns) {
          const k = `${r.studentId}|${c.key}`;
          const v = vals.get(k) ?? null;
          if (v !== (initial.get(k) ?? null)) cells.push({ studentId: r.studentId, nodeIds: c.nodeIds, masteryLevelId: v });
        }
      }
      if (cells.length === 0) return setMsg({ ok: true, text: t('grid.nothingToSave') });
      const res = await saveClassGridAction(periodId, cells);
      if (!res.ok) return setMsg({ ok: false, text: res.error });
      setMsg({ ok: true, text: t('grid.saved', { count: cells.length }) });
      router.refresh();
    });

  const dirty = useMemo(() => {
    for (const [k, v] of vals) if ((initial.get(k) ?? null) !== (v ?? null)) return true;
    return false;
  }, [vals, initial]);

  return (
    <div className="space-y-3">
      {/* Barre d'outils */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('grid.search')}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
        />
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm shadow-sm">
          <span className="text-xs text-slate-500">{t('grid.prefill')}</span>
          <select value={prefill} onChange={(e) => setPrefill(e.target.value)} className="bg-transparent text-sm focus:outline-none">
            {scale.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <button type="button" onClick={applyPrefill} className="rounded-md bg-brand-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-brand-700">
            {t('grid.apply')}
          </button>
        </div>
        {aptitudes.length > 0 && (
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 shadow-sm">
            <input type="checkbox" checked={hideApt} onChange={(e) => setHideApt(e.target.checked)} className="accent-brand-600" />
            {t('grid.hideAptitudes')}
          </label>
        )}
        <div className="ms-auto flex items-center gap-2">
          {msg && <span className={`text-xs ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{msg.text}</span>}
          <button
            type="button"
            disabled={pending || !dirty}
            onClick={save}
            className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {pending ? t('grid.saving') : t('grid.save')}
          </button>
        </div>
      </div>

      {/* Échelle (rappel des couleurs) */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        {scale.map((m) => (
          <span key={m.id} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: m.color }} />
            {m.label}
          </span>
        ))}
      </div>

      {/* Grille */}
      <div className="overflow-x-auto rounded-2xl border border-brand-200 bg-white">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th
                rowSpan={2}
                className="sticky start-0 z-20 min-w-[12rem] border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-start text-xs font-semibold uppercase tracking-wide text-slate-600"
              >
                {t('grid.students')}
              </th>
              {academic.length > 0 && (
                <th colSpan={academic.length} className="border-b border-slate-200 bg-brand-50 px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-brand-800">
                  {t('grid.academic')}
                </th>
              )}
              {!hideApt && aptitudes.length > 0 && (
                <th colSpan={aptitudes.length} className="border-b border-slate-200 bg-amber-50 px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-amber-800">
                  {t('grid.aptitudes')}
                </th>
              )}
            </tr>
            <tr>
              {shownCols.map((c) => (
                <th
                  key={c.key}
                  className={`border-b-2 border-slate-200 px-2 py-2 text-center align-bottom text-[11px] font-semibold text-slate-700 ${
                    c.kind === 'aptitude' ? 'bg-amber-50/40' : ''
                  }`}
                  style={{ minWidth: '9rem' }}
                >
                  <div>{c.label}</div>
                  {c.sublabel && <div className="mt-0.5 text-[10px] font-medium normal-case text-slate-400">{c.sublabel}</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((r, i) => (
              <tr key={r.studentId} className={i % 2 ? 'bg-slate-50/40' : ''}>
                <td className={`sticky start-0 z-10 border-b border-slate-100 px-4 py-2 font-medium text-slate-800 ${i % 2 ? 'bg-slate-50' : 'bg-white'}`}>
                  {r.name}
                </td>
                {shownCols.map((c) => {
                  const levelId = vals.get(`${r.studentId}|${c.key}`) ?? null;
                  const sel = scale.find((m) => m.id === levelId) ?? null;
                  return (
                    <td key={c.key} className={`border-b border-slate-100 px-2 py-2 text-center ${c.kind === 'aptitude' ? 'bg-amber-50/20' : ''}`}>
                      <div className="flex items-center justify-center gap-1.5">
                        {scale.map((m) => {
                          const on = m.id === levelId;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              title={m.label}
                              aria-pressed={on}
                              onClick={() => setCell(r.studentId, c.key, m.id)}
                              className="h-4 w-4 rounded-full transition"
                              style={{
                                backgroundColor: m.color,
                                opacity: on ? 1 : 0.28,
                                transform: on ? 'scale(1.25)' : 'none',
                                boxShadow: on ? `0 0 0 3px ${m.color}40` : 'none',
                              }}
                            />
                          );
                        })}
                        <span className="ms-1 w-[4.5rem] text-start text-[10px] font-semibold" style={{ color: sel?.color ?? '#94a3b8' }}>
                          {sel?.label ?? '—'}
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={shownCols.length + 1} className="px-4 py-10 text-center text-slate-500">
                  {t('grid.noStudent')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
