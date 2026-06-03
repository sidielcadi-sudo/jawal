'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { isParticipant } from '@/lib/messaging';

type Result = { ok: true; id?: string } | { ok: false; error: string };

const startSchema = z.object({
  subject: z.string().trim().min(2, 'Objet trop court.').max(200),
  body: z.string().trim().min(1, 'Message vide.').max(5000),
});

/** Le parent ouvre une nouvelle conversation avec l'école. */
export async function startConversationAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  if (!session.user.isParent) return { ok: false, error: 'Réservé aux comptes parent.' };

  const parsed = startSchema.safeParse({
    subject: formData.get('subject'),
    body: formData.get('body'),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  const tenantId = session.user.tenantId;
  const userId = session.user.id;

  const id = await withTenant(tenantId, async (tx) => {
    const conv = await tx.conversation.create({
      data: { tenantId, subject: parsed.data.subject, createdBy: userId },
    });

    // Participants : le parent + tout le personnel (comptes non-parent, non
    // super-admin), pour que l'école voie la conversation dans sa boîte.
    const staff = await tx.user.findMany({
      where: {
        disabledAt: null,
        isSuperAdmin: false,
        id: { not: userId },
        userRoles: { none: { role: { code: 'parent' } } },
      },
      select: { id: true },
    });
    const participantIds = [userId, ...staff.map((s) => s.id)];
    await tx.conversationParticipant.createMany({
      data: participantIds.map((uid) => ({
        tenantId,
        conversationId: conv.id,
        userId: uid,
        lastReadAt: uid === userId ? new Date() : null,
      })),
    });

    await tx.message.create({
      data: { tenantId, conversationId: conv.id, senderUserId: userId, body: parsed.data.body },
    });
    return conv.id;
  });

  revalidatePath('/parent/messages');
  return { ok: true, id };
}

const replySchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().trim().min(1, 'Message vide.').max(5000),
});

/** Le parent répond dans une conversation dont il est participant. */
export async function parentReplyAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  if (!session.user.isParent) return { ok: false, error: 'Réservé aux comptes parent.' };

  const parsed = replySchema.safeParse({
    conversationId: formData.get('conversationId'),
    body: formData.get('body'),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  const tenantId = session.user.tenantId;
  const userId = session.user.id;

  const res = await withTenant(tenantId, async (tx): Promise<Result> => {
    if (!(await isParticipant(tx, parsed.data.conversationId, userId)))
      return { ok: false, error: 'Conversation introuvable.' };
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
    return { ok: true };
  });

  if (res.ok) revalidatePath(`/parent/messages/${parsed.data.conversationId}`);
  return res;
}

/** Marque la conversation comme lue pour le parent (compteur de non-lus). */
export async function markParentReadAction(conversationId: string): Promise<Result> {
  const session = await auth();
  if (!session?.user || !session.user.isParent) return { ok: false, error: 'Non autorisé' };
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
