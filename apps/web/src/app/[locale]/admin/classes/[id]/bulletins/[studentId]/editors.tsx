'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { saveCouncilEntryAction, saveSubjectAppreciationAction } from './actions';

const COUNCIL_DECISIONS = [
  'FELICITATIONS',
  'ENCOURAGEMENTS',
  'COMPLIMENTS',
  'AVERTISSEMENT_TRAVAIL',
  'AVERTISSEMENT_COMP',
  'PASSAGE',
  'REDOUBLEMENT',
  'ORIENTATION',
] as const;

export function AppreciationEditor({
  studentId,
  subjectId,
  periodId,
  initialText,
}: {
  studentId: string;
  subjectId: string;
  periodId: string;
  initialText: string;
}) {
  const t = useTranslations('admin.bulletin.editor');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [text, setText] = useState(initialText);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState('');
  const isDirty = text.trim() !== initialText.trim();

  function save() {
    setError('');
    const fd = new FormData();
    fd.set('studentId', studentId);
    fd.set('subjectId', subjectId);
    fd.set('periodId', periodId);
    fd.set('text', text);
    startTransition(async () => {
      const r = await saveSubjectAppreciationAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSavedAt(new Date());
      router.refresh();
    });
  }

  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('placeholderSubject')}
        rows={2}
        disabled={isPending}
        className="w-full rounded border border-slate-300 px-2 py-1 text-xs shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      {error && <p className="text-[10px] text-red-700">{error}</p>}
      <div className="mt-1 flex items-center justify-between">
        <span className="text-[10px] text-slate-500">
          {savedAt
            ? t('savedAt', { time: savedAt.toLocaleTimeString() })
            : isDirty
              ? t('unsaved')
              : ''}
        </span>
        <button
          type="button"
          onClick={save}
          disabled={isPending || !isDirty}
          className="rounded bg-brand-600 px-2 py-0.5 text-[10px] font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
        >
          {isPending ? t('saving') : t('save')}
        </button>
      </div>
    </div>
  );
}

export function CouncilEditor({
  classId,
  studentId,
  periodId,
  initial,
}: {
  classId: string;
  studentId: string;
  periodId: string;
  initial: { generalAppreciation: string; decision: string; heldAt: string };
}) {
  const t = useTranslations('admin.bulletin.council');
  const tEditor = useTranslations('admin.bulletin.editor');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [text, setText] = useState(initial.generalAppreciation);
  const [decision, setDecision] = useState(initial.decision);
  const [heldAt, setHeldAt] = useState(initial.heldAt);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState('');

  function save() {
    setError('');
    const fd = new FormData();
    fd.set('classId', classId);
    fd.set('studentId', studentId);
    fd.set('periodId', periodId);
    fd.set('generalAppreciation', text);
    fd.set('decision', decision);
    fd.set('heldAt', heldAt);
    startTransition(async () => {
      const r = await saveCouncilEntryAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSavedAt(new Date());
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('generalLabel')}</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('generalPlaceholder')}
          rows={3}
          disabled={isPending}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-700">{t('decisionLabel')}</label>
          <select
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
            disabled={isPending}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="">{t('noDecision')}</option>
            {COUNCIL_DECISIONS.map((d) => (
              <option key={d} value={d}>
                {t(`decisions.${d}` as never)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700">{t('heldAtLabel')}</label>
          <input
            type="date"
            value={heldAt}
            onChange={(e) => setHeldAt(e.target.value)}
            disabled={isPending}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
      </div>
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">
          {savedAt ? tEditor('savedAt', { time: savedAt.toLocaleTimeString() }) : ''}
        </span>
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="rounded-lg bg-brand-600 px-3 py-1 text-xs font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
        >
          {isPending ? tEditor('saving') : tEditor('save')}
        </button>
      </div>
    </div>
  );
}
