import { withTenant } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';
import { isParticipant } from '@/lib/messaging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/mobile/messages/[id]/reply  { body }
 * → le parent répond dans une conversation dont il est participant.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const principal = await verifyMobileToken(req);
  if (!principal) return Response.json({ error: 'Non authentifié.' }, { status: 401 });

  let payload: { body?: string };
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }
  const body = payload.body?.trim();
  if (!body) return Response.json({ error: 'Message vide.' }, { status: 400 });
  if (body.length > 5000) return Response.json({ error: 'Message trop long.' }, { status: 400 });

  const result = await withTenant(principal.tenantId, async (tx) => {
    if (!(await isParticipant(tx, id, principal.userId))) return 'forbidden' as const;
    await tx.message.create({
      data: { tenantId: principal.tenantId, conversationId: id, senderUserId: principal.userId, body },
    });
    await tx.conversation.update({ where: { id }, data: { updatedAt: new Date() } });
    await tx.conversationParticipant.update({
      where: { conversationId_userId: { conversationId: id, userId: principal.userId } },
      data: { lastReadAt: new Date() },
    });
    return 'ok' as const;
  });

  if (result === 'forbidden') return Response.json({ error: 'Accès refusé.' }, { status: 403 });
  return Response.json({ ok: true });
}
