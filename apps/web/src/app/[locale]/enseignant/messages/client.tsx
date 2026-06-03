'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { teacherReplyAction, markTeacherReadAction } from './actions';

export function ReplyForm({ conversationId }: { conversationId: string }) {
  const t = useTranslations('enseignant.messages');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError('');
    startTransition(async () => {
      const r = await teacherReplyAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      formRef.current?.reset();
      router.refresh();
    });
  }

  return (
    <form ref={formRef} onSubmit={submit} className="space-y-2">
      <input type="hidden" name="conversationId" value={conversationId} />
      <textarea
        name="body"
        required
        rows={3}
        placeholder={t('replyPlaceholder')}
        disabled={isPending}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      {error && <p className="text-xs text-red-700">{error}</p>}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
        >
          {isPending ? t('sending') : t('reply')}
        </button>
      </div>
    </form>
  );
}

export function MarkRead({ conversationId }: { conversationId: string }) {
  useEffect(() => {
    void markTeacherReadAction(conversationId);
  }, [conversationId]);
  return null;
}
