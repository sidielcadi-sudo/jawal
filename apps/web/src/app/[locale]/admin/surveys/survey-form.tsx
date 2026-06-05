'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createSurveyAction } from './actions';

type QuestionType = 'RATING_5' | 'TEXT';
type Question = { label: string; type: QuestionType; required: boolean };

const AUDIENCES = ['ALL', 'PARENTS', 'TEACHERS', 'STAFF', 'STUDENTS'] as const;

export function SurveyForm({
  locale,
  periods,
}: {
  locale: string;
  periods: { id: string; label: string }[];
}) {
  const t = useTranslations('admin.surveys.form');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [questions, setQuestions] = useState<Question[]>([
    { label: t('defaultQuestion'), type: 'RATING_5', required: true },
  ]);

  const inputCls =
    'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

  function addQuestion(type: QuestionType) {
    setQuestions((qs) => [...qs, { label: '', type, required: true }]);
  }
  function removeQuestion(idx: number) {
    setQuestions((qs) => qs.filter((_, i) => i !== idx));
  }
  function patchQuestion(idx: number, patch: Partial<Question>) {
    setQuestions((qs) => qs.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  }

  function onSubmit(formData: FormData) {
    setError('');
    const cleaned = questions
      .map((q) => ({ ...q, label: q.label.trim() }))
      .filter((q) => q.label.length > 0);
    if (cleaned.length === 0 || !cleaned.some((q) => q.type === 'RATING_5')) {
      setError(t('errors.needRating'));
      return;
    }
    formData.set('questions', JSON.stringify(cleaned));
    startTransition(async () => {
      const r = await createSurveyAction(formData);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(`/${locale}/admin/surveys/${(r.data as { id: string }).id}`);
      router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="block text-xs font-medium text-slate-700">{t('title')}</span>
          <input type="text" name="title" required maxLength={200} className={inputCls} />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-xs font-medium text-slate-700">{t('description')}</span>
          <textarea name="description" rows={2} maxLength={2000} className={inputCls} />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-700">{t('audience')}</span>
          <select name="audience" defaultValue="PARENTS" className={inputCls}>
            {AUDIENCES.map((a) => (
              <option key={a} value={a}>
                {t(`audiences.${a}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-700">{t('period')}</span>
          <select name="periodId" defaultValue="" className={inputCls}>
            <option value="">{t('noPeriod')}</option>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 sm:col-span-2">
          <input
            type="checkbox"
            name="anonymous"
            defaultChecked
            className="rounded border-slate-300"
          />
          <span className="text-sm text-slate-700">{t('anonymous')}</span>
        </label>
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">{t('questions')}</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => addQuestion('RATING_5')}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              + {t('addRating')}
            </button>
            <button
              type="button"
              onClick={() => addQuestion('TEXT')}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              + {t('addText')}
            </button>
          </div>
        </div>
        <p className="mb-3 text-xs text-slate-500">{t('questionsHint')}</p>

        <div className="space-y-2">
          {questions.map((q, idx) => (
            <div
              key={idx}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2"
            >
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  q.type === 'RATING_5'
                    ? 'bg-brand-50 text-brand-700'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {q.type === 'RATING_5' ? t('typeRating') : t('typeText')}
              </span>
              <input
                type="text"
                value={q.label}
                onChange={(e) => patchQuestion(idx, { label: e.target.value })}
                placeholder={t('questionPlaceholder')}
                className="focus:border-brand-500 focus:ring-brand-500 min-w-[200px] flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1"
              />
              <label className="flex items-center gap-1 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={q.required}
                  onChange={(e) => patchQuestion(idx, { required: e.target.checked })}
                  className="rounded border-slate-300"
                />
                {t('required')}
              </label>
              <button
                type="button"
                onClick={() => removeQuestion(idx)}
                className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100"
              >
                {t('remove')}
              </button>
            </div>
          ))}
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          {t('cancel')}
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="bg-brand-600 hover:bg-brand-700 rounded-lg px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-50"
        >
          {isPending ? t('saving') : t('save')}
        </button>
      </div>
    </form>
  );
}
