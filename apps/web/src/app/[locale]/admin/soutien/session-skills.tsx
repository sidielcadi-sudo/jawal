'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { setSessionSkillsAction, saveSessionCompetencyAction } from './actions';

type Item = { id: string; label: string; group: string };
type Mastery = { id: string; code: string; label: string; color: string };
type Student = { studentId: string; name: string };

/** Sélection des compétences travaillées pendant la séance. */
export function SessionSkillPicker({
  sessionId,
  items,
  selected,
}: {
  sessionId: string;
  items: Item[];
  selected: string[];
}) {
  const t = useTranslations('admin.soutien.skills');
  const router = useRouter();
  const [sel, setSel] = useState<string[]>(selected);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const toggle = (id: string) =>
    setSel((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const groups = [...new Set(items.map((i) => i.group))];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="rounded-lg border border-brand-300 bg-white px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
        >
          {open ? t('close') : t('choose')} ▾
        </button>
        <span className="text-xs text-slate-400">{t('count', { count: sel.length })}</span>
      </div>

      {open && (
        <div className="mt-2 rounded-xl border border-slate-200 bg-white p-2">
          <div className="max-h-64 overflow-y-auto">
            {groups.map((g) => (
              <div key={g} className="mb-2">
                <div className="px-1 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {g}
                </div>
                {items
                  .filter((i) => i.group === g)
                  .map((i) => (
                    <label
                      key={i.id}
                      className="flex items-center gap-2 rounded px-1 py-1 text-xs hover:bg-slate-50"
                    >
                      <input type="checkbox" checked={sel.includes(i.id)} onChange={() => toggle(i.id)} />
                      {i.label}
                    </label>
                  ))}
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-end border-t border-slate-100 pt-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await setSessionSkillsAction(sessionId, sel);
                  setOpen(false);
                  router.refresh();
                })
              }
              className="rounded-lg bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {t('save')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Évaluation rapide des élèves de la séance sur une compétence ciblée. */
export function SessionCompetencyGrid({
  sessionId,
  node,
  scale,
  students,
  initial,
}: {
  sessionId: string;
  node: { id: string; label: string; descriptor: string | null };
  scale: Mastery[];
  students: Student[];
  initial: Record<string, string | null>;
}) {
  const t = useTranslations('admin.soutien.skills');
  const router = useRouter();
  const [vals, setVals] = useState<Record<string, string | null>>(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className="rounded-xl border border-slate-200">
      <div className="border-b border-slate-100 px-3 py-2">
        <div className="text-sm font-medium text-slate-800">{node.label}</div>
        {node.descriptor && <div className="text-[11px] italic text-slate-400">💡 {node.descriptor}</div>}
      </div>
      <ul className="divide-y divide-slate-100">
        {students.map((s) => (
          <li key={s.studentId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <span className="text-sm text-slate-700">{s.name}</span>
            <div className="flex gap-1.5">
              {scale.map((m) => {
                const on = vals[s.studentId] === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    title={m.label}
                    onClick={() => setVals((v) => ({ ...v, [s.studentId]: on ? null : m.id }))}
                    className="rounded-lg border px-2 py-0.5 text-[11px] font-semibold"
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
        {students.length === 0 && (
          <li className="px-3 py-6 text-center text-xs text-slate-400">{t('noStudent')}</li>
        )}
      </ul>
      <div className="flex items-center gap-2 border-t border-slate-100 px-3 py-2">
        <button
          type="button"
          disabled={pending || students.length === 0}
          onClick={() =>
            start(async () => {
              setMsg(null);
              const r = await saveSessionCompetencyAction(
                sessionId,
                node.id,
                students.map((s) => ({ studentId: s.studentId, masteryLevelId: vals[s.studentId] ?? null })),
              );
              if (!r.ok) return setMsg({ ok: false, text: r.error });
              setMsg({ ok: true, text: t('saved', { count: r.saved ?? 0 }) });
              router.refresh();
            })
          }
          className="rounded-lg bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {t('save')}
        </button>
        {msg && <span className={`text-xs ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
