'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { saveSubjectAppreciationAction } from '../actions';

const MAX = 255;

/**
 * Cellule d'appréciation : éditable (sauvegarde au blur) pour le prof de la
 * matière, lecture seule sinon (appréciation d'un autre enseignant).
 */
export function AppreciationCell({
  studentId,
  classId,
  subjectId,
  periodId,
  initial,
  canEdit,
}: {
  studentId: string;
  classId: string;
  subjectId: string;
  periodId: string;
  initial: string | null;
  canEdit: boolean;
}) {
  const t = useTranslations('enseignant.notes.releve');
  const [text, setText] = useState(initial ?? '');
  const [saved, setSaved] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle');
  const [pending, start] = useTransition();

  if (!canEdit) {
    return text.trim() ? (
      <p className="whitespace-pre-wrap text-sm text-slate-600">{text}</p>
    ) : (
      <span className="text-xs italic text-slate-300">{t('noAppreciation')}</span>
    );
  }

  function save() {
    if ((initial ?? '') === text.trim()) return;
    setSaved('saving');
    start(async () => {
      const r = await saveSubjectAppreciationAction({ studentId, classId, subjectId, periodId, text: text.trim() });
      setSaved(r.ok ? 'ok' : 'err');
    });
  }

  return (
    <div>
      <textarea
        value={text}
        maxLength={MAX}
        rows={2}
        onChange={(e) => {
          setText(e.target.value);
          if (saved !== 'idle') setSaved('idle');
        }}
        onBlur={save}
        placeholder={t('placeholder')}
        className="w-full resize-y rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      <div className="mt-0.5 flex items-center justify-between text-[10px] text-slate-400">
        <span>
          {saved === 'saving' || pending
            ? t('saving')
            : saved === 'ok'
              ? `✓ ${t('saved')}`
              : saved === 'err'
                ? t('saveError')
                : ''}
        </span>
        <span>
          {text.length}/{MAX}
        </span>
      </div>
    </div>
  );
}
