import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { ConversationCreateForm } from './client';
import { personDisplayName } from '@/lib/localized-name';

export default async function MessagesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.messages');

  const session = (await auth())!;
  const tenantId = session.user.tenantId;

  const { conversations, users } = await withTenant(tenantId, async (tx) => {
    // Conversations dont l'utilisateur est participant
    const myParticipations = await tx.conversationParticipant.findMany({
      where: { userId: session.user.id },
      include: {
        conversation: {
          include: {
            messages: {
              orderBy: { sentAt: 'desc' },
              take: 1,
            },
            participants: {
              include: {
                // Pas de relation user dans le schéma actuel ; on rejoindra côté requête séparée
              },
            },
            _count: { select: { messages: true } },
          },
        },
      },
      orderBy: { conversation: { updatedAt: 'desc' } },
    });

    // Tous les users du tenant (pour le picker de participants)
    const users = await tx.user.findMany({
      where: { id: { not: session.user.id }, disabledAt: null },
      include: { userPersons: { include: { person: { select: { firstName: true, lastName: true, firstNameAr: true, lastNameAr: true, type: true } } } } },
      orderBy: { email: 'asc' },
    });

    // Construire le résumé conversations avec compteur non-lus
    const conversations = myParticipations.map((p) => {
      const unread = p.conversation.messages.filter((m) => {
        if (m.senderUserId === session.user.id) return false;
        if (!p.lastReadAt) return true;
        return m.sentAt > p.lastReadAt;
      }).length;
      const lastMessage = p.conversation.messages[0];
      return {
        id: p.conversation.id,
        subject: p.conversation.subject,
        updatedAt: p.conversation.updatedAt,
        lastMessage: lastMessage
          ? { body: lastMessage.body, sentAt: lastMessage.sentAt, fromMe: lastMessage.senderUserId === session.user.id }
          : null,
        messageCount: p.conversation._count.messages,
        unread,
      };
    });

    return { conversations, users };
  });

  return (
    <div className="px-3 py-3">
      <header className="mb-4 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
        <p className="mt-0.5 text-sm text-slate-600">{t('count', { count: conversations.length })}</p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
            <ul className="divide-y divide-slate-100">
              {conversations.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/${locale}/admin/messages/${c.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">{c.subject}</span>
                        {c.unread > 0 && (
                          <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                            {c.unread}
                          </span>
                        )}
                      </div>
                      {c.lastMessage && (
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {c.lastMessage.fromMe ? `${t('you')}: ` : ''}
                          {c.lastMessage.body}
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 tabular-nums">
                      {new Date(c.updatedAt).toLocaleDateString(locale)}
                    </span>
                  </Link>
                </li>
              ))}
              {conversations.length === 0 && (
                <li className="px-5 py-10 text-center text-slate-500">{t('empty')}</li>
              )}
            </ul>
          </div>
        </section>

        <aside>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-base font-semibold text-slate-900">{t('create')}</h2>
            <p className="mt-1 text-xs text-slate-500">{t('createHint')}</p>
            <div className="mt-4">
              <ConversationCreateForm
                users={users.map((u) => {
                  const person = u.userPersons[0]?.person;
                  return {
                    id: u.id,
                    email: u.email,
                    label: person ? personDisplayName(locale, person) : u.email,
                  };
                })}
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
