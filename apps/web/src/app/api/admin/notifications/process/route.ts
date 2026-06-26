import { prismaAdmin } from '@/lib/db';
import { sendViaProvider, type SendChannel } from '@/lib/notify-providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/notifications/process
 * Traite la file des notifications PENDING (tous tenants) — destiné à un cron.
 * Protégé par l'en-tête `x-cron-secret` (= env CRON_SECRET). Utilise prismaAdmin
 * (hors RLS) pour balayer l'ensemble des établissements.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const pending = await prismaAdmin.notificationLog.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });

  let sent = 0;
  let failed = 0;
  for (const n of pending) {
    if (!n.recipient) {
      await prismaAdmin.notificationLog.update({ where: { id: n.id }, data: { status: 'SKIPPED' } });
      continue;
    }
    const r = await sendViaProvider(n.channel as SendChannel, n.recipient, n.body);
    await prismaAdmin.notificationLog.update({
      where: { id: n.id },
      data: r.ok ? { status: 'SENT', sentAt: new Date(), error: null } : { status: 'FAILED', error: r.error },
    });
    if (r.ok) sent++;
    else failed++;
  }

  return Response.json({ processed: pending.length, sent, failed });
}
