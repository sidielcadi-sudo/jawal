'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { saveLessonAction, addLessonLinkAction } from '../../actions';

type HwType = 'EXERCICE' | 'LECTURE' | 'REVISION' | 'PROJET' | 'AUTRE';
type HwDiff = 'FACILE' | 'MOYEN' | 'DIFFICILE';
type Homework = { description: string; dueDate?: string; type: HwType; difficulty?: HwDiff };

const HW_TYPES: HwType[] = ['EXERCICE', 'LECTURE', 'REVISION', 'PROJET', 'AUTRE'];
const HW_DIFFS: HwDiff[] = ['FACILE', 'MOYEN', 'DIFFICILE'];

export function LessonForm({
  locale,
  entryId,
  date,
  hasLesson = false,
  initial,
}: {
  locale: string;
  entryId: string;
  date: string;
  /** true en édition : le dépôt de ressources passe par le ResourcesPanel de la page. */
  hasLesson?: boolean;
  initial: {
    title: string;
    summary: string;
    activities: string;
    competencies: string;
    theme: string;
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
  // Ressources « en attente » : jointes AVANT l'enregistrement, envoyées au save.
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [stagedLinks, setStagedLinks] = useState<{ url: string; label: string }[]>([]);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function addStagedFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setStagedFiles((prev) => [...prev, ...Array.from(files)]);
    if (fileRef.current) fileRef.current.value = '';
  }
  function addStagedLink() {
    const url = linkUrl.trim();
    if (!url) return;
    setStagedLinks((prev) => [...prev, { url, label: linkLabel.trim() }]);
    setLinkUrl('');
    setLinkLabel('');
  }

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
      // La séance existe : on envoie les ressources mises en attente.
      for (const file of stagedFiles) {
        const fd = new FormData();
        fd.append('file', file);
        const resp = await fetch(`/api/enseignant/cahier/${entryId}/${date}/resource`, {
          method: 'POST',
          body: fd,
        });
        if (!resp.ok) {
          setError(await resp.text());
          return;
        }
      }
      for (const link of stagedLinks) {
        const fd = new FormData();
        fd.set('lessonEntryId', r.lessonEntryId);
        fd.set('url', link.url);
        if (link.label) fd.set('label', link.label);
        const lr = await addLessonLinkAction(fd);
        if (!lr.ok) {
          setError(lr.error);
          return;
        }
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
          <label className="block">
            <span className="block text-xs font-medium text-slate-700">{t('fields.theme')}</span>
            <textarea
              name="theme"
              rows={2}
              defaultValue={initial.theme}
              placeholder={t('fields.themeHint')}
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

      {!hasLesson && (
      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">{t('section.resources')}</h2>
        <p className="mb-2 text-xs text-slate-500">{t('resources.stageHint')}</p>
        {(stagedFiles.length > 0 || stagedLinks.length > 0) && (
          <ul className="mb-3 space-y-1.5">
            {stagedFiles.map((f, i) => (
              <li
                key={`f${i}`}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <span className="text-slate-400">📎</span>
                <span className="flex-1 truncate text-slate-700">{f.name}</span>
                <button
                  type="button"
                  onClick={() => setStagedFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  className="text-xs text-red-600 hover:text-red-800"
                >
                  {t('remove')}
                </button>
              </li>
            ))}
            {stagedLinks.map((l, i) => (
              <li
                key={`l${i}`}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <span className="text-slate-400">🔗</span>
                <span className="flex-1 truncate text-slate-700">{l.label || l.url}</span>
                <button
                  type="button"
                  onClick={() => setStagedLinks((prev) => prev.filter((_, idx) => idx !== i))}
                  className="text-xs text-red-600 hover:text-red-800"
                >
                  {t('remove')}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            📎 {t('resources.addFile')}
            <input
              ref={fileRef}
              type="file"
              multiple
              onChange={(e) => addStagedFiles(e.target.files)}
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
            />
          </label>
          <span className="text-xs text-slate-400">{t('resources.fileHint')}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-2">
          <label className="block flex-1">
            <span className="block text-[11px] text-slate-500">{t('resources.linkUrl')}</span>
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://…"
              className="focus:border-brand-500 focus:ring-brand-500 mt-0.5 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1"
            />
          </label>
          <label className="block flex-1">
            <span className="block text-[11px] text-slate-500">{t('resources.linkLabel')}</span>
            <input
              type="text"
              value={linkLabel}
              onChange={(e) => setLinkLabel(e.target.value)}
              className="focus:border-brand-500 focus:ring-brand-500 mt-0.5 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1"
            />
          </label>
          <button
            type="button"
            onClick={addStagedLink}
            disabled={!linkUrl.trim()}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {t('resources.addLink')}
          </button>
        </div>
      </section>
      )}

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
