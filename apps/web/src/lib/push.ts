import 'server-only';
import { prismaAdmin } from '@jawal/db';

/**
 * Notifications push via l'**API Expo Push** (app mobile parent). Best-effort :
 * ne doit jamais bloquer l'opération métier. Les jetons d'appareils sont dans
 * `device_tokens` (un user peut avoir plusieurs appareils).
 */
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export type PushPayload = { title: string; body: string; data?: Record<string, unknown> };

/** Envoie un lot de messages à Expo (batch de 100 max). */
export async function sendExpoPush(messages: Array<{ to: string } & PushPayload>): Promise<void> {
  if (messages.length === 0) return;
  try {
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100).map((m) => ({
        to: m.to,
        title: m.title,
        body: m.body,
        data: m.data,
        sound: 'default',
        priority: 'high',
      }));
      await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(batch),
      });
    }
  } catch (e) {
    console.error('[push] envoi Expo échoué', e);
  }
}

/**
 * Pousse une notification aux appareils d'un ensemble d'utilisateurs d'un
 * tenant. Utilise `prismaAdmin` scopé par `tenantId` (best-effort, hors tx).
 */
export async function pushToUsers(tenantId: string, userIds: string[], payload: PushPayload): Promise<void> {
  if (userIds.length === 0) return;
  try {
    const devices = await prismaAdmin.deviceToken.findMany({
      where: { tenantId, userId: { in: [...new Set(userIds)] } },
      select: { token: true },
    });
    await sendExpoPush(devices.map((d) => ({ to: d.token, ...payload })));
  } catch (e) {
    console.error('[push] pushToUsers échoué', e);
  }
}

/** Pousse à TOUS les appareils d'un tenant (app parent → destinataires = parents). */
export async function pushToTenant(tenantId: string, payload: PushPayload): Promise<void> {
  try {
    const devices = await prismaAdmin.deviceToken.findMany({ where: { tenantId }, select: { token: true } });
    await sendExpoPush(devices.map((d) => ({ to: d.token, ...payload })));
  } catch (e) {
    console.error('[push] pushToTenant échoué', e);
  }
}

/**
 * Pousse une notification aux parents participants d'une conversation (hors
 * expéditeur), quand l'école répond. Best-effort, à appeler hors transaction.
 */
export async function pushConversationReply(
  tenantId: string,
  conversationId: string,
  senderUserId: string,
  subject: string | null,
): Promise<void> {
  try {
    const participants = await prismaAdmin.conversationParticipant.findMany({
      where: { tenantId, conversationId, userId: { not: senderUserId } },
      select: { userId: true },
    });
    if (participants.length === 0) return;
    // ConversationParticipant n'a pas de relation User → on filtre les parents à part.
    const parents = await prismaAdmin.user.findMany({
      where: {
        id: { in: participants.map((p) => p.userId) },
        disabledAt: null,
        userRoles: { some: { role: { code: 'parent' } } },
      },
      select: { id: true },
    });
    await pushToUsers(
      tenantId,
      parents.map((p) => p.id),
      {
        title: 'Nouveau message',
        body: subject ? `L'établissement vous a répondu — « ${subject} »` : 'L\'établissement vous a répondu.',
        data: { type: 'message', conversationId },
      },
    );
  } catch (e) {
    console.error('[push] pushConversationReply échoué', e);
  }
}
