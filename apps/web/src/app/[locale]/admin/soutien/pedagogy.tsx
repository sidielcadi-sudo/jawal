'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  createSupportSessionAction,
  addSupportResourceAction,
  deleteSupportResourceAction,
  generateSupportBillingAction,
} from './actions';

const input = 'rounded-lg border border-slate-300 px-3 py-1.5 text-sm shadow-sm';

export function CreateSessionForm({ courseId }: { courseId: string }) {
  const t = useTranslations('admin.soutien');
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');
  return (
    <form
      ref={ref}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setErr('');
        start(async () => {
          const r = await createSupportSessionAction(courseId, fd);
          if (!r.ok) return setErr(r.error);
          ref.current?.reset();
          router.refresh();
        });
      }}
      className="flex flex-wrap items-end gap-2"
    >
      <label className="block text-sm">
        <span className="text-xs text-slate-500">{t('session.date')}</span>
        <input name="date" type="date" required className={`mt-1 block ${input}`} />
      </label>
      <label className="block flex-1 text-sm">
        <span className="text-xs text-slate-500">{t('session.topic')}</span>
        <input name="topic" className={`mt-1 block w-full ${input}`} placeholder={t('session.topicPlaceholder')} />
      </label>
      <button disabled={pending} className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
        {t('session.add')}
      </button>
      {err && <span className="text-xs text-red-700">{err}</span>}
    </form>
  );
}

export function ResourceManager({
  sessionId,
  resources,
}: {
  sessionId: string;
  resources: { id: string; title: string; url: string }[];
}) {
  const t = useTranslations('admin.soutien');
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <ul className="space-y-1.5">
        {resources.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
            <a href={r.url} target="_blank" rel="noopener" className="truncate text-brand-700 hover:underline">
              🔗 {r.title}
            </a>
            <button
              type="button"
              disabled={pending}
              onClick={() => start(async () => { await deleteSupportResourceAction(sessionId, r.id); router.refresh(); })}
              className="text-xs text-slate-400 hover:text-red-600"
            >
              ✕
            </button>
          </li>
        ))}
        {resources.length === 0 && <li className="text-xs text-slate-400">{t('resource.empty')}</li>}
      </ul>
      <form
        ref={ref}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          start(async () => {
            const r = await addSupportResourceAction(sessionId, fd);
            if (r.ok) { ref.current?.reset(); router.refresh(); }
          });
        }}
        className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-2"
      >
        <input name="title" required placeholder={t('resource.title')} className={`${input} flex-1`} />
        <input name="url" type="url" required placeholder="https://…" className={`${input} flex-1`} />
        <button disabled={pending} className="rounded-lg border border-brand-300 bg-white px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50">
          + {t('resource.add')}
        </button>
      </form>
    </div>
  );
}

export function GenerateBillingButton({ courseId }: { courseId: string }) {
  const t = useTranslations('admin.soutien');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg(null);
            const r = await generateSupportBillingAction(courseId);
            if (!r.ok) setMsg({ ok: false, text: r.error });
            else { setMsg({ ok: true, text: t('billing.done', { count: r.created ?? 0 }) }); router.refresh(); }
          })
        }
        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        💳 {t('billing.generate')}
      </button>
      {msg && <span className={`text-xs ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{msg.text}</span>}
    </div>
  );
}
