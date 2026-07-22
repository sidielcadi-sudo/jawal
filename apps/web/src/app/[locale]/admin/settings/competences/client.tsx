'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { setNodeSubjectAction, setCompetencyLevelsAction } from './actions';

type Opt = { id: string; label: string };

/** Rattachement d'une feuille à une matière (détermine qui peut évaluer). */
export function SubjectPicker({
  nodeId,
  subjectId,
  subjects,
}: {
  nodeId: string;
  subjectId: string | null;
  subjects: Opt[];
}) {
  const t = useTranslations('admin.competences');
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <select
      disabled={pending}
      defaultValue={subjectId ?? ''}
      onChange={(e) =>
        start(async () => {
          await setNodeSubjectAction(nodeId, e.target.value || null);
          router.refresh();
        })
      }
      className="rounded-lg border border-slate-300 px-2 py-1 text-xs shadow-sm disabled:opacity-50"
    >
      <option value="">{t('allTeachers')}</option>
      {subjects.map((s) => (
        <option key={s.id} value={s.id}>
          {s.label}
        </option>
      ))}
    </select>
  );
}

/** Sélection des niveaux scolaires où la compétence est évaluable. */
export function LevelPicker({
  competencyId,
  levels,
  selected,
}: {
  competencyId: string;
  levels: Opt[];
  selected: string[];
}) {
  const t = useTranslations('admin.competences');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string[]>(selected);
  const [pending, start] = useTransition();

  const toggle = (id: string) =>
    setSel((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const save = () =>
    start(async () => {
      await setCompetencyLevelsAction(competencyId, sel);
      setOpen(false);
      router.refresh();
    });

  const label = sel.length === 0 ? t('allLevels') : t('nLevels', { count: sel.length });

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
      >
        {label} ▾
      </button>
      {open && (
        <div className="absolute end-0 z-20 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          <p className="mb-1 px-1 text-[11px] text-slate-400">{t('levelsHint')}</p>
          <div className="max-h-56 overflow-y-auto">
            {levels.map((l) => (
              <label key={l.id} className="flex items-center gap-2 rounded px-1 py-1 text-xs hover:bg-slate-50">
                <input type="checkbox" checked={sel.includes(l.id)} onChange={() => toggle(l.id)} />
                {l.label}
              </label>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
            <button type="button" onClick={() => setSel([])} className="text-[11px] text-slate-500 hover:underline">
              {t('resetLevels')}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={save}
              className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {t('save')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
