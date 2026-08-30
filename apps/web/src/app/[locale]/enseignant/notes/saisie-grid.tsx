'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { computeAverage20, type AverageItem } from '@/lib/grade-average';
import { personDisplayName } from '@/lib/localized-name';
import {
  createDevoirAction,
  updateDevoirAction,
  deleteDevoirAction,
  saveNotesMatrixAction,
} from './actions';

type Student = { id: string; firstName: string; lastName: string; firstNameAr: string | null; lastNameAr: string | null };
type Devoir = {
  id: string;
  label: string;
  date: string;
  maxValue: number;
  weight: number;
  optional: boolean;
  optionalMode: 'BONUS' | 'NOTE';
  grades: Record<string, number | null>;
};

/** '12,5' / '12.5' → 12.5 ; vide/NaN → null. */
function parseMark(text: string): number | null {
  const t = text.replace(',', '.').trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
}

const fmt2 = (n: number) => n.toFixed(2).replace('.', ',');

export function SaisieGrid({
  locale,
  classId,
  subjectId,
  periodId,
  students,
  devoirs,
}: {
  locale: string;
  classId: string;
  subjectId: string;
  periodId: string;
  students: Student[];
  devoirs: Devoir[];
}) {
  const t = useTranslations('enseignant.notes');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  // Modale de paramètres : création ('new') ou édition d'un devoir existant.
  const [modal, setModal] = useState<{ mode: 'new' } | { mode: 'edit'; devoir: Devoir } | null>(null);

  // État des cellules : clé `${devoirId}|${studentId}` → texte saisi.
  const [cells, setCells] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const d of devoirs)
      for (const s of students) {
        const v = d.grades[s.id];
        init[`${d.id}|${s.id}`] = v === null || v === undefined ? '' : String(v);
      }
    return init;
  });

  function setCell(devoirId: string, studentId: string, text: string) {
    setCells((c) => ({ ...c, [`${devoirId}|${studentId}`]: text }));
  }

  // Moyenne pondérée /20 avec gestion des devoirs facultatifs (bonus / note).
  const moyennes = useMemo(() => {
    const out: Record<string, number | null> = {};
    for (const s of students) {
      const items: AverageItem[] = [];
      for (const d of devoirs) {
        const v = parseMark(cells[`${d.id}|${s.id}`] ?? '');
        if (v === null) continue;
        items.push({
          n20: (v / d.maxValue) * 20,
          weight: d.weight,
          optional: d.optional,
          mode: d.optionalMode,
        });
      }
      out[s.id] = computeAverage20(items);
    }
    return out;
  }, [cells, devoirs, students]);

  function dmy(iso: string) {
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, {
      day: '2-digit',
      month: '2-digit',
      timeZone: 'UTC',
    });
  }

  function save() {
    setError('');
    const cellsPayload = devoirs.flatMap((d) =>
      students.map((s) => ({
        evaluationId: d.id,
        studentId: s.id,
        value: parseMark(cells[`${d.id}|${s.id}`] ?? ''),
      })),
    );
    const fd = new FormData();
    fd.set('payload', JSON.stringify({ classId, subjectId, cells: cellsPayload }));
    start(async () => {
      const r = await saveNotesMatrixAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSavedAt(new Date());
      router.refresh();
    });
  }

  function submitModal(fd: FormData) {
    if (!modal) return;
    setError('');
    fd.set('classId', classId);
    fd.set('subjectId', subjectId);
    fd.set('periodId', periodId);
    start(async () => {
      const r =
        modal.mode === 'edit'
          ? await updateDevoirAction(modal.devoir.id, fd)
          : await createDevoirAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setModal(null);
      router.refresh();
    });
  }

  function removeDevoir(id: string) {
    if (!confirm(t('confirmDeleteDevoir'))) return;
    setError('');
    start(async () => {
      const r = await deleteDevoirAction(id);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="border-collapse text-sm">
          <thead>
            {/* Ligne 1 : bouton créer + dates */}
            <tr className="border-b border-slate-200">
              <th className="sticky start-0 z-10 bg-white p-2 text-start" colSpan={2}>
                <button
                  type="button"
                  onClick={() => setModal({ mode: 'new' })}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  + {t('createDevoir')}
                </button>
              </th>
              {devoirs.map((d) => (
                <th key={d.id} className="min-w-[5rem] border-s border-slate-100 px-1 py-2 text-center align-bottom">
                  <div className="text-xs font-medium text-slate-700">{dmy(d.date)}</div>
                  {d.optional && (
                    <div
                      className={`mx-auto mt-0.5 w-fit rounded px-1 py-0.5 text-[9px] font-medium ${
                        d.optionalMode === 'BONUS'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {d.optionalMode === 'BONUS' ? t('badge.bonus') : t('badge.optional')}
                    </div>
                  )}
                  <div className="mt-0.5 flex items-center justify-center gap-1">
                    <button
                      type="button"
                      onClick={() => setModal({ mode: 'edit', devoir: d })}
                      title={t('editDevoir')}
                      className="text-[10px] text-slate-300 hover:text-brand-600"
                    >
                      ⚙
                    </button>
                    <button
                      type="button"
                      onClick={() => removeDevoir(d.id)}
                      title={t('deleteDevoir')}
                      className="text-[10px] text-slate-300 hover:text-red-600"
                    >
                      ✕
                    </button>
                  </div>
                </th>
              ))}
            </tr>
            {/* Ligne 2 : libellés colonnes + barème/coeff */}
            <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
              <th className="sticky start-0 z-10 bg-slate-50 px-3 py-2 text-start font-semibold text-slate-700">
                {t('studentsCount', { count: students.length })}
              </th>
              <th className="px-3 py-2 text-center font-semibold text-slate-700">{t('average')}</th>
              {devoirs.map((d) => (
                <th
                  key={d.id}
                  className="border-s border-slate-100 px-1 py-1.5 text-center font-normal"
                  title={d.label}
                >
                  <div className="truncate text-[10px] text-slate-500">{d.label}</div>
                  <div className="text-[10px] text-slate-400">
                    /{d.maxValue} · ×{d.weight}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {students.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50/60">
                <td className="sticky start-0 z-10 max-w-[12rem] truncate bg-white px-3 py-1.5 text-slate-800">
                  {personDisplayName(locale, s)}
                </td>
                <td className="px-3 py-1.5 text-center font-semibold tabular-nums text-brand-700">
                  {moyennes[s.id] === null ? '—' : fmt2(moyennes[s.id]!)}
                </td>
                {devoirs.map((d) => {
                  const key = `${d.id}|${s.id}`;
                  const text = cells[key] ?? '';
                  const v = parseMark(text);
                  const over = v !== null && v > d.maxValue;
                  return (
                    <td key={d.id} className="border-s border-slate-100 px-1 py-1 text-center">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={text}
                        onChange={(e) => setCell(d.id, s.id, e.target.value)}
                        placeholder="—"
                        className={`w-14 rounded border px-1 py-1 text-center text-sm tabular-nums focus:outline-none focus:ring-1 ${
                          over
                            ? 'border-red-400 bg-red-50 text-red-900 focus:ring-red-500'
                            : 'border-slate-200 focus:border-brand-500 focus:ring-brand-500'
                        }`}
                      />
                    </td>
                  );
                })}
                {devoirs.length === 0 && (
                  <td className="px-4 py-2 text-xs text-slate-400">{t('noDevoir')}</td>
                )}
              </tr>
            ))}
            {students.length === 0 && (
              <tr>
                <td colSpan={2} className="px-4 py-10 text-center text-slate-500">
                  {t('noStudents')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {savedAt && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          {t('savedAt', { time: savedAt.toLocaleTimeString(locale) })}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={pending || devoirs.length === 0}
          className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? t('saving') : t('save')}
        </button>
      </div>

      {/* Modale paramètres du devoir (création / édition) */}
      {modal && (
        <DevoirModal
          devoir={modal.mode === 'edit' ? modal.devoir : null}
          pending={pending}
          onSubmit={submitModal}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function DevoirModal({
  devoir,
  pending,
  onSubmit,
  onClose,
}: {
  devoir: Devoir | null;
  pending: boolean;
  onSubmit: (fd: FormData) => void;
  onClose: () => void;
}) {
  const t = useTranslations('enseignant.notes');
  const [optional, setOptional] = useState(devoir?.optional ?? false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-base font-semibold text-slate-900">
          {devoir ? t('editDevoir') : t('createDevoir')}
        </h3>
        <form action={onSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-700">{t('form.label')}</label>
            <input
              name="label"
              required
              defaultValue={devoir?.label}
              placeholder="Contrôle n°1"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-700">{t('form.date')}</label>
              <input
                type="date"
                name="date"
                required
                defaultValue={devoir?.date ?? new Date().toISOString().slice(0, 10)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">{t('form.max')}</label>
              <input
                type="number"
                name="maxValue"
                defaultValue={devoir?.maxValue ?? 20}
                min={1}
                step="any"
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">{t('form.weight')}</label>
              <input
                type="number"
                name="weight"
                defaultValue={devoir?.weight ?? 1}
                min={0.1}
                step="any"
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
              />
            </div>
          </div>

          {/* Facultatif : bonus / note */}
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <input
              id="optional"
              type="checkbox"
              name="optional"
              checked={optional}
              onChange={(e) => setOptional(e.target.checked)}
            />
            <label htmlFor="optional" className="text-sm text-slate-700">
              {t('form.optional')}
            </label>
            <select
              name="optionalMode"
              defaultValue={devoir?.optionalMode ?? 'BONUS'}
              disabled={!optional}
              className="ms-auto rounded-lg border border-slate-300 px-2 py-1.5 text-sm disabled:opacity-50"
            >
              <option value="BONUS">{t('form.asBonus')}</option>
              <option value="NOTE">{t('form.asNote')}</option>
            </select>
          </div>
          <p className="text-[11px] text-slate-400">
            {optional ? t('form.optionalHint') : t('form.normalHint')}
          </p>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              {t('form.cancel')}
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {devoir ? t('form.saveDevoir') : t('form.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
