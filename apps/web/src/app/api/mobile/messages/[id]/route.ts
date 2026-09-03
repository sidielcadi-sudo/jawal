import { withTenant } from '@/lib/db';
import { verifyMobileParent } from '@/lib/mobile-auth';
import { getThread, isParticipant, resolveSenderNames } from '@/lib/messaging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/mobile/messages/[id] → fil de la conversation (marque lu à l'ouverture).
 * 403 si le parent n'est pas participant.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const principal = await verifyMobileParent(req);
  if (!principal) return Response.json({ error: 'Non authentifié.' }, { status: 401 });

  const data = await withTenant(principal.tenantId, async (tx) => {
    if (!(await isParticipant(tx, id, principal.userId))) return 'forbidden' as const;
    const thread = await getThread(tx, id);
    if (!thread) return null;
    const names = await resolveSenderNames(tx, thread.messages.map((m) => m.senderUserId));
    // Marque lu → met à jour le compteur de non-lus.
    await tx.conversationParticipant.update({
      where: { conversationId_userId: { conversationId: id, userId: principal.userId } },
      data: { lastReadAt: new Date() },
    });
    return {
      id: thread.id,
      subject: thread.subject,
      messages: thread.messages.map((m) => ({
        id: m.id,
        body: m.body,
        sentAt: m.sentAt,
        mine: m.senderUserId === principal.userId,
        senderName: names.get(m.senderUserId) ?? null,
      })),
    };
  });

  if (data === 'forbidden') return Response.json({ error: 'Accès refusé.' }, { status: 403 });
  if (!data) return Response.json({ error: 'Conversation introuvable.' }, { status: 404 });
  return Response.json(data);
}
