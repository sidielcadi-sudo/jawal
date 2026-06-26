'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { withTenant } from '@/lib/db';
import { sendViaProvider, type SendChannel } from '@/lib/notify-providers';

type ProcessResult = { ok: true; sent: number; failed: number } | { ok: false; error: string };

/**
 * Traite la file des notifications PENDING/FAILED : appelle le fournisseur
 * (WhatsApp/SMS) et met à jour le statut. Les appels HTTP sont faits HORS
 * transaction (chargement puis maj unitaire) pour ne pas bloquer la base.
 */
export async function processPendingNotificationsAction(): Promise<ProcessResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('students.write');
  const tenantId = session.user.tenantId;

  const pending = await withTenant(tenantId, (tx) =>
    tx.notificationLog.findMany({ where: { status: { in: ['PENDING', 'FAILED'] } }, orderBy: { createdAt: 'asc' }, take: 50 }),
  );

  let sent = 0;
  let failed = 0;
  for (const n of pending) {
    if (!n.recipient) {
      await withTenant(tenantId, (tx) => tx.notificationLog.update({ where: { id: n.id }, data: { status: 'SKIPPED' } }));
      continue;
    }
    const r = await sendViaProvider(n.channel as SendChannel, n.recipient, n.body);
    await withTenant(tenantId, (tx) =>
      tx.notificationLog.update({
        where: { id: n.id },
        data: r.ok ? { status: 'SENT', sentAt: new Date(), error: null } : { status: 'FAILED', error: r.error },
      }),
    );
    if (r.ok) sent++;
    else failed++;
  }
  revalidatePath('/admin/transport/notifications');
  return { ok: true, sent, failed };
}

/** Renvoie une notification précise (PENDING ou FAILED). */
export async function retryNotificationAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('students.write');
  const tenantId = session.user.tenantId;
  const n = await withTenant(tenantId, (tx) => tx.notificationLog.findUnique({ where: { id } }));
  if (!n) return { ok: false, error: 'Introuvable.' };
  if (!n.recipient) return { ok: false, error: 'Pas de destinataire.' };
  const r = await sendViaProvider(n.channel as SendChannel, n.recipient, n.body);
  await withTenant(tenantId, (tx) =>
    tx.notificationLog.update({
      where: { id },
      data: r.ok ? { status: 'SENT', sentAt: new Date(), error: null } : { status: 'FAILED', error: r.error },
    }),
  );
  revalidatePath('/admin/transport/notifications');
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}
