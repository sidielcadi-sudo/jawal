import { withTenant } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';
import {
  listConversationsForParticipant,
  countUnreadConversations,
  resolveSenderNames,
} from '@/lib/messaging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/mobile/messages → conversations du parent (+ non-lus). */
export async function GET(req: Request) {
  const principal = await verifyMobileToken(req);
  if (!principal) return Response.json({ error: 'Non authentifié.' }, { status: 401 });

  const data = await withTenant(principal.tenantId, async (tx) => {
    const list = await listConversationsForParticipant(tx, principal.userId);
    const names = await resolveSenderNames(
      tx,
      list.map((c) => c.last?.senderUserId).filter((v): v is string => !!v),
    );
    const unreadCount = await countUnreadConversations(tx, principal.userId);
    return {
      unreadCount,
      conversations: list.map((c) => ({
        id: c.id,
        subject: c.subject,
        updatedAt: c.updatedAt,
        unread: c.flag,
        last: c.last
          ? {
              body: c.last.body,
              sentAt: c.last.sentAt,
              mine: c.last.senderUserId === principal.userId,
              senderName: names.get(c.last.senderUserId) ?? null,
            }
          : null,
      })),
    };
  });

  return Response.json(data);
}

/**
 * POST /api/mobile/messages  { subject, body }
 * → le parent ouvre une conversation avec l'école (mêmes participants que le web).
 */
export async function POST(req: Request) {
  const principal = await verifyMobileToken(req);
  if (!principal) return Response.json({ error: 'Non authentifié.' }, { status: 401 });

  let payload: { subject?: string; body?: string };
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }
  const subject = payload.subject?.trim();
  const body = payload.body?.trim();
  if (!subject || subject.length < 2) return Response.json({ error: 'Objet trop court.' }, { status: 400 });
  if (!body) return Response.json({ error: 'Message vide.' }, { status: 400 });
  if (subject.length > 200 || body.length > 5000)
    return Response.json({ error: 'Message trop long.' }, { status: 400 });

  const id = await withTenant(principal.tenantId, async (tx) => {
    const conv = await tx.conversation.create({
      data: { tenantId: principal.tenantId, subject, createdBy: principal.userId },
    });
    // Participants : le parent + tout le personnel (comptes non-parent).
    const staff = await tx.user.findMany({
      where: {
        disabledAt: null,
        isSuperAdmin: false,
        id: { not: principal.userId },
        userRoles: { none: { role: { code: 'parent' } } },
      },
      select: { id: true },
    });
    const participantIds = [principal.userId, ...staff.map((s) => s.id)];
    await tx.conversationParticipant.createMany({
      data: participantIds.map((uid) => ({
        tenantId: principal.tenantId,
        conversationId: conv.id,
        userId: uid,
        lastReadAt: uid === principal.userId ? new Date() : null,
      })),
    });
    await tx.message.create({
      data: { tenantId: principal.tenantId, conversationId: conv.id, senderUserId: principal.userId, body },
    });
    return conv.id;
  });

  return Response.json({ ok: true, id });
}
