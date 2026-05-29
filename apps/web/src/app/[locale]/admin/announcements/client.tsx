'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  createAnnouncementAction,
  deleteAnnouncementAction,
  publishAnnouncementAction,
} from './actions';

const inputCls =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

const AUDIENCES = ['ALL', 'PARENTS', 'TEACHERS', 'STAFF', 'CLASS', 'LEVEL'] as const;

export function AnnouncementCreateForm({
  classes,
  levels,
}: {
  classes: { id: string; name: string }[];
  levels: { id: string; label: string }[];
}) {
  const t = useTranslations('admin.announcements.form');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [audience, setAudience] = useState<string>('ALL');
  const ref = useRef<HTMLFormElement>(null);

  function onSubmit(formData: FormData) {
    setError('');
    startTransition(async () => {
      const r = await createAnnouncementAction(formData);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      ref.current?.reset();
      setAudience('ALL');
      router.refresh();
    });
  }

  return (
    <form ref={ref} action={onSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('title')}</label>
        <input type="text" name="title" required className={inputCls} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('body')}</label>
        <textarea name="body" required rows={5} className={inputCls} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('audience')}</label>
        <select name="audience" value={audience} onChange={(e) => setAudience(e.target.value)} className={inputCls}>
          {AUDIENCES.map((a) => (
            <option key={a} value={a}>
              {t(`audiences.${a}` as never)}
            </option>
          ))}
        </select>
      </div>
      {audience === 'CLASS' && (
        <div>
          <label className="block text-xs font-medium text-slate-700">{t('class')}</label>
          <select name="classId" required defaultValue="" className={inputCls}>
            <option value="" disabled>
              —
            </option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {audience === 'LEVEL' && (
        <div>
          <label className="block text-xs font-medium text-slate-700">{t('level')}</label>
          <select name="levelId" required defaultValue="" className={inputCls}>
            <option value="" disabled>
              —
            </option>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="publish" />
        {t('publishImmediately')}
      </label>
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
      >
        {isPending ? t('creating') : t('create')}
      </button>
    </form>
  );
}

export function AnnouncementRowActions({
  id,
  isPublished,
}: {
  id: string;
  isPublished: boolean;
}) {
  const t = useTranslations('admin.announcements.actions');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function publish() {
    if (!confirm(t('confirmPublish'))) return;
    startTransition(async () => {
      const r = await publishAnnouncementAction(id);
      if (r.ok) router.refresh();
    });
  }

  function del() {
    if (!confirm(t('confirmDelete'))) return;
    startTransition(async () => {
      const r = await deleteAnnouncementAction(id);
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="flex gap-2">
      {!isPublished && (
        <button
          type="button"
          onClick={publish}
          disabled={isPending}
          className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
        >
          {t('publish')}
        </button>
      )}
      <button
        type="button"
        onClick={del}
        disabled={isPending}
        className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
      >
        {t('delete')}
      </button>
    </div>
  );
}
