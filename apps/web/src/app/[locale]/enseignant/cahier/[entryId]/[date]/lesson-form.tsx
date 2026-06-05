'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { saveLessonAction } from '../../actions';

type HwType = 'EXERCICE' | 'LECTURE' | 'REVISION' | 'PROJET' | 'AUTRE';
type HwDiff = 'FACILE' | 'MOYEN' | 'DIFFICILE';
type Homework = { description: string; dueDate?: string; type: HwType; difficulty?: HwDiff };

const HW_TYPES: HwType[] = ['EXERCICE', 'LECTURE', 'REVISION', 'PROJET', 'AUTRE'];
const HW_DIFFS: HwDiff[] = ['FACILE', 'MOYEN', 'DIFFICILE'];

export function LessonForm({
  locale,
  entryId,
  date,
  initial,
}: {
  locale: string;
  entryId: string;
  date: string;
  initial: {
    title: string;
    summary: string;
    activities: string;
    competencies: string;
    visibleToStudents: boolean;
    visibleToParents: boolean;
    publishAt: string;
    homeworks: Homework[];
  };
}) {
  const t = useTranslations('enseignant.cahier');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [homeworks, setHomeworks] = useState<Homework[]>(initial.homeworks);
  const [visStudents, setVisStudents] = useState(initial.visibleToStudents);
  const [visParents, setVisParents] = useState(initial.visibleToParents);
  const [publishAt, setPublishAt] = useState(initial.publishAt);

  const inputCls =
    'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

  function addHw() {
    setHomeworks((h) => [...h, { description: '', type: 'EXERCICE' }]);
  }
  function removeHw(i: number) {
    setHomeworks((h) => h.filter((_, idx) => idx !== i));
  }
  function patchHw(i: number, patch: Partial<Homework>) {
    setHomeworks((h) => h.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }

  function onSubmit(formData: FormData) {
    setError('');
    const cleaned = homeworks
      .map((h) => ({ ...h, description: h.description.trim() }))
      .filter((h) => h.description.length > 0);
    formData.set('entryId', entryId);
    formData.set('date', date);
    formData.set('visibleToStudents', String(visStudents));
    formData.set('visibleToParents', String(visParents));
    formData.set('publishAt', publishAt);
    formData.set('homeworks', JSON.stringify(cleaned));
    startTransition(async () => {
      const r = await saveLessonAction(formData);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(`/${locale}/enseignant/cahier?week=${date}`);
      router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="space-y-6">
      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">{t('section.content')}</h2>
        <div className="space-y-4">
          <label className="block">
            <span className="block text-xs font-medium text-slate-700">
              {t('fields.title')} <span className="text-red-500">*</span>
            </span>
            <input
              type="text"
              name="title"
              required
              maxLength={300}
              defaultValue={initial.title}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-700">{t('fields.summary')}</span>
            <textarea name="summary" rows={3} defaultValue={initial.summary} className={inputCls} />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-700">
              {t('fields.activities')}
            </span>
            <textarea
              name="activities"
              rows={2}
              defaultValue={initial.activities}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-700">
              {t('fields.competencies')}
            </span>
            <textarea
              name="competencies"
              rows={2}
              defaultValue={initial.competencies}
              placeholder={t('fields.competenciesHint')}
              className={inputCls}
            />
          </label>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">{t('section.homework')}</h2>
          <button
            type="button"
            onClick={addHw}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
          >
            + {t('addHomework')}
          </button>
        </div>
        {homeworks.length === 0 ? (
          <p className="text-xs text-slate-400">{t('noHomework')}</p>
        ) : (
          <div className="space-y-3">
            {homeworks.map((h, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-3">
                <textarea
                  value={h.description}
                  onChange={(e) => patchHw(i, { description: e.target.value })}
                  placeholder={t('fields.homeworkDescription')}
                  rows={2}
                  className="focus:border-brand-500 focus:ring-brand-500 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1"
                />
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <label className="block">
                    <span className="block text-[11px] text-slate-500">{t('fields.dueDate')}</span>
                    <input
                      type="date"
                      value={h.dueDate ?? ''}
                      onChange={(e) => patchHw(i, { dueDate: e.target.value || undefined })}
                      className="mt-0.5 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[11px] text-slate-500">{t('fields.type')}</span>
                    <select
                      value={h.type}
                      onChange={(e) => patchHw(i, { type: e.target.value as HwType })}
                      className="mt-0.5 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                    >
                      {HW_TYPES.map((ty) => (
                        <option key={ty} value={ty}>
                          {t(`homeworkTypes.${ty}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="block text-[11px] text-slate-500">
                      {t('fields.difficulty')}
                    </span>
                    <select
                      value={h.difficulty ?? ''}
                      onChange={(e) =>
                        patchHw(i, {
                          difficulty: (e.target.value || undefined) as HwDiff | undefined,
                        })
                      }
                      className="mt-0.5 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                    >
                      <option value="">—</option>
                      {HW_DIFFS.map((d) => (
                        <option key={d} value={d}>
                          {t(`difficulties.${d}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => removeHw(i)}
                    className="ms-auto rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100"
                  >
                    {t('remove')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">{t('section.visibility')}</h2>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={visStudents}
              onChange={(e) => setVisStudents(e.target.checked)}
              className="rounded border-slate-300"
            />
            {t('fields.visibleToStudents')}
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={visParents}
              onChange={(e) => setVisParents(e.target.checked)}
              className="rounded border-slate-300"
            />
            {t('fields.visibleToParents')}
          </label>
          <label className="block pt-1">
            <span className="block text-xs font-medium text-slate-700">
              {t('fields.publishAt')}
            </span>
            <input
              type="datetime-local"
              value={publishAt}
              onChange={(e) => setPublishAt(e.target.value)}
              className="focus:border-brand-500 focus:ring-brand-500 mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1"
            />
            <span className="mt-1 block text-[11px] text-slate-500">
              {t('fields.publishAtHint')}
            </span>
          </label>
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
          onClick={() => router.push(`/${locale}/enseignant/cahier?week=${date}`)}
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
