'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createConversationAction, sendMessageAction } from './actions';

const inputCls =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

export function ConversationCreateForm({
  users,
}: {
  users: { id: string; email: string; label: string }[];
}) {
  const t = useTranslations('admin.messages.form');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLFormElement>(null);

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function onSubmit(formData: FormData) {
    setError('');
    // Réinjecter les participants sélectionnés
    formData.delete('participantUserIds');
    for (const id of selected) formData.append('participantUserIds', id);
    startTransition(async () => {
      const r = await createConversationAction(formData);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const cid = (r.data as { id: string }).id;
      ref.current?.reset();
      setSelected([]);
      router.push(`/${window.location.pathname.split('/')[1]}/admin/messages/${cid}`);
    });
  }

  const filtered = users.filter(
    (u) =>
      u.label.toLowerCase().includes(query.toLowerCase()) ||
      u.email.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <form ref={ref} action={onSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('subject')}</label>
        <input type="text" name="subject" required className={inputCls} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('recipients')}</label>
        <input
          type="search"
          placeholder={t('searchRecipients')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={inputCls}
        />
        <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-slate-200">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500">{t('noUsers')}</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtered.map((u) => (
                <li key={u.id}>
                  <label className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={selected.includes(u.id)}
                      onChange={() => toggle(u.id)}
                    />
                    <span className="font-medium">{u.label}</span>
                    <span className="ms-auto text-slate-400">{u.email}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="mt-1 text-[10px] text-slate-500">{t('selectedCount', { count: selected.length })}</p>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('firstMessage')}</label>
        <textarea name="firstMessage" required rows={3} className={inputCls} />
      </div>
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div>
      )}
      <button
        type="submit"
        disabled={isPending || selected.length === 0}
        className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
      >
        {isPending ? t('sending') : t('send')}
      </button>
    </form>
  );
}

export function MessageReplyForm({ conversationId }: { conversationId: string }) {
  const t = useTranslations('admin.messages.thread');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [body, setBody] = useState('');
  const [error, setError] = useState('');

  function submit() {
    if (body.trim().length === 0) return;
    setError('');
    const fd = new FormData();
    fd.set('conversationId', conversationId);
    fd.set('body', body);
    startTransition(async () => {
      const r = await sendMessageAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setBody('');
      router.refresh();
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={t('replyPlaceholder')}
        rows={3}
        disabled={isPending}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[10px] text-slate-500">{t('shortcut')}</span>
        <button
          type="button"
          onClick={submit}
          disabled={isPending || body.trim().length === 0}
          className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
        >
          {isPending ? t('sending') : t('send')}
        </button>
      </div>
    </div>
  );
}
