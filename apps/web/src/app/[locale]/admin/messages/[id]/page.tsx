import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { MessageReplyForm } from '../client';
import { markConversationReadAction } from '../actions';

export default async function ConversationThreadPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.messages.thread');

  const session = (await auth())!;
  const tenantId = session.user.tenantId;

  // Marquer comme lu côté serveur dès l'ouverture
  await markConversationReadAction(id).catch(() => null);

  const data = await withTenant(tenantId, async (tx) => {
    const conv = await tx.conversation.findUnique({
      where: { id },
      include: {
        participants: true,
        messages: { orderBy: { sentAt: 'asc' } },
      },
    });
    if (!conv) return null;
    const isParticipant = conv.participants.some((p) => p.userId === session.user.id);
    if (!isParticipant) return null;

    // Mapping userId → email/label via user_persons
    const userIds = Array.from(new Set([...conv.participants.map((p) => p.userId), ...conv.messages.map((m) => m.senderUserId)]));
    const users = await tx.user.findMany({
      where: { id: { in: userIds } },
      include: { userPersons: { include: { person: { select: { firstName: true, lastName: true } } } } },
    });
    const userLabel = new Map<string, string>();
    for (const u of users) {
      const p = u.userPersons[0]?.person;
      userLabel.set(u.id, p ? `${p.lastName} ${p.firstName}` : u.email);
    }

    return { conv, userLabel };
  });

  if (!data) notFound();
  const { conv, userLabel } = data;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <nav className="mb-3 text-xs text-slate-500">
        <Link href={`/${locale}/admin/messages`} className="hover:text-brand-700">
          {t('messages')}
        </Link>
        <span className="mx-1.5">›</span>
        <span>{conv.subject}</span>
      </nav>

      <header className="mb-4">
        <h1 className="text-xl font-semibold text-slate-900">{conv.subject}</h1>
        <p className="mt-1 text-xs text-slate-500">
          {t('participants')} :{' '}
          {conv.participants.map((p) => userLabel.get(p.userId) ?? p.userId.slice(0, 8)).join(', ')}
        </p>
      </header>

      <ul className="space-y-3">
        {conv.messages.map((m) => {
          const fromMe = m.senderUserId === session.user.id;
          const label = userLabel.get(m.senderUserId) ?? m.senderUserId.slice(0, 8);
          return (
            <li
              key={m.id}
              className={`max-w-[80%] rounded-2xl border p-3 text-sm ${
                fromMe
                  ? 'ms-auto border-brand-200 bg-brand-50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div className="text-[10px] text-slate-500">
                <span className="font-medium">{label}</span>
                <span className="ms-1.5">{new Date(m.sentAt).toLocaleString(locale)}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-slate-900">{m.body}</p>
            </li>
          );
        })}
      </ul>

      <div className="mt-4">
        <MessageReplyForm conversationId={conv.id} />
      </div>
    </div>
  );
}
