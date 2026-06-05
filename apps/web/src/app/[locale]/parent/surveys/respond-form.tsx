'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { submitSurveyResponseAction } from './actions';

type Question = { id: string; label: string; type: 'RATING_5' | 'TEXT'; required: boolean };
type Answer = { questionId: string; rating?: number; text?: string };

export function RespondForm({ surveyId, questions }: { surveyId: string; questions: Question[] }) {
  const t = useTranslations('parent.surveys');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  function setRating(qId: string, rating: number) {
    setAnswers((a) => ({ ...a, [qId]: { questionId: qId, rating } }));
  }
  function setText(qId: string, text: string) {
    setAnswers((a) => ({ ...a, [qId]: { questionId: qId, text } }));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    // Contrôle des questions obligatoires côté client (le serveur revérifie).
    for (const q of questions) {
      if (!q.required) continue;
      const a = answers[q.id];
      const filled = q.type === 'RATING_5' ? a?.rating != null : (a?.text ?? '').trim().length > 0;
      if (!filled) {
        setError(t('errors.missingRequired'));
        return;
      }
    }
    const payload = Object.values(answers).filter(
      (a) => a.rating != null || (a.text ?? '').trim().length > 0,
    );
    const fd = new FormData();
    fd.set('surveyId', surveyId);
    fd.set('answers', JSON.stringify(payload));
    startTransition(async () => {
      const r = await submitSurveyResponseAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDone(true);
      router.refresh();
    });
  }

  if (done) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
        {t('thanks')}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {questions.map((q) => (
        <div key={q.id}>
          <p className="text-sm font-medium text-slate-800">
            {q.label}
            {q.required && <span className="text-red-500"> *</span>}
          </p>
          {q.type === 'RATING_5' ? (
            <div className="mt-2 flex gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => {
                const active = (answers[q.id]?.rating ?? 0) >= n;
                return (
                  <button
                    type="button"
                    key={n}
                    onClick={() => setRating(q.id, n)}
                    aria-label={`${n}`}
                    className={`grid h-9 w-9 place-items-center rounded-lg border text-lg transition-colors ${
                      active
                        ? 'border-brand-400 bg-brand-50 text-brand-600'
                        : 'border-slate-200 text-slate-300 hover:border-slate-300'
                    }`}
                  >
                    ★
                  </button>
                );
              })}
            </div>
          ) : (
            <textarea
              rows={2}
              maxLength={2000}
              value={answers[q.id]?.text ?? ''}
              onChange={(e) => setText(q.id, e.target.value)}
              className="focus:border-brand-500 focus:ring-brand-500 mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1"
            />
          )}
        </div>
      ))}

      {error && <p className="text-sm text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="bg-brand-600 hover:bg-brand-700 rounded-lg px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-50"
      >
        {isPending ? t('submitting') : t('submit')}
      </button>
    </form>
  );
}
