'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { isParticipant } from '@/lib/messaging';
import { pushConversationReply } from '@/lib/push';

type Result = { ok: true } | { ok: false; error: string };

const replySchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().trim().min(1, 'Message vide.').max(5000),
});

/** L'enseignant répond dans une conversation dont il est participant. */
export async function teacherReplyAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  if (!session.user.isTeacher) return { ok: false, error: 'Réservé aux comptes enseignant.' };

  const parsed = replySchema.safeParse({
    conversationId: formData.get('conversationId'),
    body: formData.get('body'),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  const tenantId = session.user.tenantId;
  const userId = session.user.id;

  const res = await withTenant(tenantId, async (tx): Promise<Result & { subject?: string }> => {
    if (!(await isParticipant(tx, parsed.data.conversationId, userId)))
      return { ok: false, error: 'Conversation introuvable.' };
    const conv = await tx.conversation.findUnique({
      where: { id: parsed.data.conversationId },
      select: { subject: true },
    });
    await tx.message.create({
      data: {
        tenantId,
        conversationId: parsed.data.conversationId,
        senderUserId: userId,
        body: parsed.data.body,
      },
    });
    await tx.conversation.update({
      where: { id: parsed.data.conversationId },
      data: { updatedAt: new Date() },
    });
    await tx.conversationParticipant.update({
      where: { conversationId_userId: { conversationId: parsed.data.conversationId, userId } },
      data: { lastReadAt: new Date() },
    });
    return { ok: true, subject: conv?.subject };
  });

  if (res.ok) {
    // Notification push aux parents participants (best-effort, hors transaction).
    await pushConversationReply(tenantId, parsed.data.conversationId, userId, res.subject ?? null);
    revalidatePath(`/enseignant/messages/${parsed.data.conversationId}`);
  }
  return res;
}

/** Marque la conversation comme lue pour l'enseignant. */
export async function markTeacherReadAction(conversationId: string): Promise<Result> {
  const session = await auth();
  if (!session?.user || !session.user.isTeacher) return { ok: false, error: 'Non autorisé' };
  const userId = session.user.id;
  await withTenant(session.user.tenantId, async (tx) => {
    if (!(await isParticipant(tx, conversationId, userId))) return;
    await tx.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: new Date() },
    });
  });
  return { ok: true };
}
