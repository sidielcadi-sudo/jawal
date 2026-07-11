'use server';

import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { countUnreadConversations } from '@/lib/messaging';

export type StaffAlertDTO = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
};

/** Alertes récentes de l'utilisateur courant + nombre de non-lues. */
export async function listMyAlertsAction(): Promise<{ alerts: StaffAlertDTO[]; unread: number }> {
  const session = await auth();
  if (!session?.user) return { alerts: [], unread: 0 };
  return withTenant(session.user.tenantId, async (tx) => {
    const [rows, unread] = await Promise.all([
      tx.staffAlert.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: 'desc' },
        take: 15,
      }),
      tx.staffAlert.count({ where: { userId: session.user.id, readAt: null } }),
    ]);
    return {
      unread,
      alerts: rows.map((a) => ({
        id: a.id,
        type: a.type,
        title: a.title,
        body: a.body,
        link: a.link,
        read: a.readAt !== null,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  });
}

/** Nombre de messages non lus de l'utilisateur courant (toutes conversations). */
export async function unreadMessagesCountAction(): Promise<number> {
  const session = await auth();
  if (!session?.user) return 0;
  return withTenant(session.user.tenantId, (tx) => countUnreadConversations(tx, session.user.id));
}

/** Marque une alerte comme lue (uniquement celles de l'utilisateur courant). */
export async function markAlertReadAction(id: string): Promise<{ ok: boolean }> {
  const session = await auth();
  if (!session?.user) return { ok: false };
  await withTenant(session.user.tenantId, async (tx) => {
    await tx.staffAlert.updateMany({
      where: { id, userId: session.user.id, readAt: null },
      data: { readAt: new Date() },
    });
  });
  return { ok: true };
}

/** Marque toutes les alertes de l'utilisateur courant comme lues. */
export async function markAllAlertsReadAction(): Promise<{ ok: boolean }> {
  const session = await auth();
  if (!session?.user) return { ok: false };
  await withTenant(session.user.tenantId, async (tx) => {
    await tx.staffAlert.updateMany({
      where: { userId: session.user.id, readAt: null },
      data: { readAt: new Date() },
    });
  });
  return { ok: true };
}
