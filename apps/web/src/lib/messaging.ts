import 'server-only';
import type { Prisma } from '@/lib/db';

type Tx = Prisma.TransactionClient;

export type ConversationListItem = {
  id: string;
  subject: string;
  updatedAt: Date;
  last: { body: string; sentAt: Date; senderUserId: string } | null;
  /** Parent : message non lu. Admin : conversation en attente de réponse. */
  flag: boolean;
};

export type ThreadMessage = { id: string; body: string; sentAt: Date; senderUserId: string };
export type Thread = {
  id: string;
  subject: string;
  createdBy: string;
  messages: ThreadMessage[];
};

/** Résout un nom affichable par userId (Person rattachée, sinon email). */
export async function resolveSenderNames(
  tx: Tx,
  userIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const users = await tx.user.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      email: true,
      userPersons: { select: { person: { select: { firstName: true, lastName: true } } }, take: 1 },
    },
  });
  const m = new Map<string, string>();
  for (const u of users) {
    const p = u.userPersons[0]?.person;
    m.set(u.id, p ? `${p.firstName} ${p.lastName}` : u.email);
  }
  return m;
}

/** Conversations d'un participant (parent) : non-lu si dernier message reçu. */
export async function listConversationsForParticipant(
  tx: Tx,
  userId: string,
): Promise<ConversationListItem[]> {
  const parts = await tx.conversationParticipant.findMany({
    where: { userId },
    select: { conversationId: true, lastReadAt: true },
  });
  if (parts.length === 0) return [];
  const lastReadById = new Map(parts.map((p) => [p.conversationId, p.lastReadAt]));
  const convs = await tx.conversation.findMany({
    where: { id: { in: parts.map((p) => p.conversationId) } },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      subject: true,
      updatedAt: true,
      messages: { orderBy: { sentAt: 'desc' }, take: 1, select: { body: true, sentAt: true, senderUserId: true } },
    },
  });
  return convs.map((c) => {
    const last = c.messages[0] ?? null;
    const lastRead = lastReadById.get(c.id) ?? null;
    const flag = !!last && last.senderUserId !== userId && (!lastRead || last.sentAt > lastRead);
    return { id: c.id, subject: c.subject, updatedAt: c.updatedAt, last, flag };
  });
}

export async function getThread(tx: Tx, conversationId: string): Promise<Thread | null> {
  const conv = await tx.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      subject: true,
      createdBy: true,
      messages: {
        orderBy: { sentAt: 'asc' },
        select: { id: true, body: true, sentAt: true, senderUserId: true },
      },
    },
  });
  return conv;
}

export async function isParticipant(tx: Tx, conversationId: string, userId: string): Promise<boolean> {
  const p = await tx.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  return !!p;
}
