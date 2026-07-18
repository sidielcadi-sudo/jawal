import 'server-only';
import type { Prisma } from '@/lib/db';

type Tx = Prisma.TransactionClient;

/**
 * Envoie un message interne (conversation 1↔1 + message) d'un utilisateur vers
 * un autre. Canal visible en portail (Messages du parent / de l'enseignant),
 * contrairement au NotificationLog (SMS/WhatsApp sortant). Retourne l'id de
 * conversation, ou null si le destinataire est introuvable/désactivé.
 */
export async function sendDirectMessage(
  tx: Tx,
  args: { tenantId: string; fromUserId: string; toUserId: string; subject: string; body: string },
): Promise<string | null> {
  if (!args.toUserId || args.toUserId === args.fromUserId) return null;
  const to = await tx.user.findFirst({
    where: { id: args.toUserId, disabledAt: null },
    select: { id: true },
  });
  if (!to) return null;

  const conv = await tx.conversation.create({
    data: { tenantId: args.tenantId, subject: args.subject, createdBy: args.fromUserId },
  });
  await tx.conversationParticipant.createMany({
    data: [...new Set([args.fromUserId, args.toUserId])].map((userId) => ({
      tenantId: args.tenantId,
      conversationId: conv.id,
      userId,
    })),
  });
  await tx.message.create({
    data: {
      tenantId: args.tenantId,
      conversationId: conv.id,
      senderUserId: args.fromUserId,
      body: args.body,
    },
  });
  return conv.id;
}
