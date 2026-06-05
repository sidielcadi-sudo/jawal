'use client';

import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { addLessonLinkAction, deleteLessonResourceAction } from '../../actions';

type Resource = { id: string; kind: 'FILE' | 'LINK'; url: string | null; label: string };

export function ResourcesPanel({
  lessonEntryId,
  entryId,
  date,
  resources,
}: {
  lessonEntryId: string;
  entryId: string;
  date: string;
  resources: Resource[];
}) {
  const t = useTranslations('enseignant.cahier');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setBusy(true);
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch(`/api/enseignant/cahier/${entryId}/${date}/resource`, {
      method: 'POST',
      body: fd,
    });
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
    if (!r.ok) {
      setError(await r.text());
      return;
    }
    router.refresh();
  }

  function onAddLink() {
    if (!linkUrl.trim()) return;
    setError('');
    const fd = new FormData();
    fd.set('lessonEntryId', lessonEntryId);
    fd.set('url', linkUrl.trim());
    if (linkLabel.trim()) fd.set('label', linkLabel.trim());
    startTransition(async () => {
      const r = await addLessonLinkAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setLinkUrl('');
      setLinkLabel('');
      router.refresh();
    });
  }

  function onDelete(id: string) {
    if (!confirm(t('resources.confirmDelete'))) return;
    startTransition(async () => {
      await deleteLessonResourceAction(id);
      router.refresh();
    });
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-700">{t('section.resources')}</h2>

      {resources.length > 0 && (
        <ul className="space-y-1.5">
          {resources.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <span className="text-slate-400">{r.kind === 'FILE' ? '📎' : '🔗'}</span>
              {r.kind === 'FILE' ? (
                <a
                  href={`/api/cahier/resource/${r.id}`}
                  target="_blank"
                  rel="noopener"
                  className="text-brand-700 flex-1 truncate hover:underline"
                >
                  {r.label}
                </a>
              ) : (
                <a
                  href={r.url ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-700 flex-1 truncate hover:underline"
                >
                  {r.label}
                </a>
              )}
              <button
                type="button"
                onClick={() => onDelete(r.id)}
                disabled={isPending}
                className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
              >
                {t('remove')}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-xs text-red-700">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
          📎 {busy ? t('resources.uploading') : t('resources.addFile')}
          <input
            ref={fileRef}
            type="file"
            onChange={onUpload}
            disabled={busy}
            className="hidden"
            accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
          />
        </label>
        <span className="text-xs text-slate-400">{t('resources.fileHint')}</span>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-2">
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
          onClick={onAddLink}
          disabled={isPending || !linkUrl.trim()}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {t('resources.addLink')}
        </button>
      </div>
    </section>
  );
}
