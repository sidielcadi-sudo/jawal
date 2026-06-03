import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getThread, isParticipant, resolveSenderNames } from '@/lib/messaging';
import { ReplyForm, MarkRead } from '../client';

export default async function ParentThreadPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = (await auth())!;
  const userId = session.user.id;
  const t = await getTranslations('parent.messages');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    if (!(await isParticipant(tx, id, userId))) return null;
    const thread = await getThread(tx, id);
    if (!thread) return null;
    const names = await resolveSenderNames(tx, thread.messages.map((m) => m.senderUserId));
    return { thread, names };
  });

  if (!data) notFound();
  const { thread, names } = data;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <MarkRead conversationId={id} />
      <nav className="mb-4 text-xs text-slate-500">
        <Link href={`/${locale}/parent/messages`} className="hover:text-brand-700">
          {t('title')}
        </Link>
        <span className="mx-1.5">›</span>
        <span>{thread.subject}</span>
      </nav>

      <h1 className="text-xl font-semibold text-slate-900">{thread.subject}</h1>

      <div className="mt-5 space-y-3">
        {thread.messages.map((m) => {
          const mine = m.senderUserId === userId;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                  mine ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-800'
                }`}
              >
                <div className={`mb-0.5 text-[10px] ${mine ? 'text-brand-100' : 'text-slate-400'}`}>
                  {mine ? t('you') : names.get(m.senderUserId) ?? t('school')} ·{' '}
                  {new Date(m.sentAt).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })}
                </div>
                <p className="whitespace-pre-wrap">{m.body}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
        <ReplyForm conversationId={id} />
      </div>
    </div>
  );
}
