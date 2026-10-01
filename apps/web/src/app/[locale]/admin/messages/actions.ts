'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { conversationCreateSchema, messageSendSchema } from '@jawal/shared';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant, prismaAdmin } from '@/lib/db';
import { safeSendEmail } from '@/lib/email';
import { pushConversationReply } from '@/lib/push';

type Result<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

function fl<T>(parsed: z.SafeParseError<T>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join('.');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * Crée une conversation 1↔N avec un premier message et tous les participants
 * (le créateur est ajouté automatiquement).
 */
export async function createConversationAction(formData: FormData): Promise<Result<{ id: string }>> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('communication.write');

  // participants envoyés en multivalués (checkbox list)
  const participantIds = formData.getAll('participantUserIds').filter((v): v is string => typeof v === 'string' && v !== '');

  const parsed = conversationCreateSchema.safeParse({
    subject: formData.get('subject'),
    participantUserIds: participantIds,
    firstMessage: formData.get('firstMessage'),
  });
  if (!parsed.success) return { ok: false, error: 'Données invalides.', fieldErrors: fl(parsed) };

  const tenantId = session.user.tenantId;
  const allParticipants = Array.from(new Set([session.user.id, ...parsed.data.participantUserIds]));

  const conv = await withTenant(tenantId, async (tx) => {
    const c = await tx.conversation.create({
      data: {
        tenantId,
        subject: parsed.data.subject,
        createdBy: session.user.id,
      },
    });
    await tx.conversationParticipant.createMany({
      data: allParticipants.map((uid) => ({ tenantId, conversationId: c.id, userId: uid })),
    });
    await tx.message.create({
      data: {
        tenantId,
        conversationId: c.id,
        senderUserId: session.user.id,
        body: parsed.data.firstMessage,
      },
    });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'create',
      entityType: 'Conversation',
      entityId: c.id,
      after: { subject: c.subject, participants: allParticipants.length },
    });
    return c;
  });

  revalidatePath('/admin/messages');
  return { ok: true, data: { id: conv.id } };
}

export async function sendMessageAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('communication.write');

  const parsed = messageSendSchema.safeParse({
    conversationId: formData.get('conversationId'),
    body: formData.get('body'),
  });
  if (!parsed.success) return { ok: false, error: 'Données invalides.', fieldErrors: fl(parsed) };

  const tenantId = session.user.tenantId;
  const notify = await withTenant(tenantId, async (tx) => {
    // Vérif que le sender est bien participant
    const p = await tx.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: parsed.data.conversationId, userId: session.user.id } },
    });
    if (!p) throw new Error('Vous n\'êtes pas participant à cette conversation');

    const conv = await tx.conversation.findUnique({
      where: { id: parsed.data.conversationId },
      select: { subject: true },
    });

    await tx.message.create({
      data: {
        tenantId,
        conversationId: parsed.data.conversationId,
        senderUserId: session.user.id,
        body: parsed.data.body,
      },
    });
    await tx.conversation.update({
      where: { id: parsed.data.conversationId },
      data: { updatedAt: new Date() },
    });

    // Destinataires de la notif : participants parents (hors expéditeur).
    const others = await tx.conversationParticipant.findMany({
      where: { conversationId: parsed.data.conversationId, userId: { not: session.user.id } },
      select: { userId: true },
    });
    const parentUsers =
      others.length > 0
        ? await tx.user.findMany({
            where: {
              id: { in: others.map((o) => o.userId) },
              disabledAt: null,
              userRoles: { some: { role: { code: 'parent' } } },
            },
            select: { email: true },
          })
        : [];
    return { subject: conv?.subject ?? '', emails: parentUsers.map((u) => u.email) };
  });

  // Notification email aux parents (best-effort, hors transaction).
  if (notify.emails.length > 0) {
    const tenant = await prismaAdmin.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, localeDefault: true },
    });
    const base = process.env.APP_URL ?? '';
    const link = `${base}/${tenant?.localeDefault ?? 'fr'}/parent/messages/${parsed.data.conversationId}`;
    await Promise.all(
      notify.emails.map((to) =>
        safeSendEmail({
          to,
          subject: `Nouveau message — ${tenant?.name ?? 'votre établissement'}`,
          html:
            `<p>Bonjour,</p>` +
            `<p>L'établissement <strong>${tenant?.name ?? ''}</strong> vous a répondu dans la conversation « ${notify.subject} ».</p>` +
            `<p><a href="${link}">Consulter le message</a> depuis votre espace parent.</p>`,
          text: `L'établissement vous a répondu dans « ${notify.subject} ». Espace parent : ${link}`,
        }),
      ),
    );
  }

  // Notification push aux parents participants (best-effort, hors transaction).
  await pushConversationReply(tenantId, parsed.data.conversationId, session.user.id, notify.subject);

  revalidatePath('/admin/messages');
  revalidatePath(`/admin/messages/${parsed.data.conversationId}`);
  return { ok: true };
}

export async function markConversationReadAction(conversationId: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };

  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    await tx.conversationParticipant.updateMany({
      where: { conversationId, userId: session.user.id },
      data: { lastReadAt: new Date() },
    });
  });
  return { ok: true };
}
