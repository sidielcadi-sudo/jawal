import { NextRequest } from 'next/server';
import { prismaAdmin } from '@/lib/db';
import { auth } from '@/lib/auth';
import { runAppelRemindersForTenant } from '@/lib/appel-reminders';

/**
 * Cron de relance « appel non fait ». À déclencher TOUTES LES ~10-15 MIN
 * pendant les heures de cours (relance le prof PENDANT la séance, avant la fin).
 * Authentification :
 *   1. Header `X-Cron-Secret` égal à AUTH_SECRET (vrais crons)
 *   2. OU une session connectée (déclenchement manuel / test)
 */
export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get('x-cron-secret');
  const isCron = !!cronSecret && cronSecret === process.env.AUTH_SECRET;

  if (!isCron) {
    const session = await auth();
    if (!session?.user) return new Response('Unauthorized', { status: 401 });
  }

  const tenants = await prismaAdmin.tenant.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, slug: true },
  });

  const results: Array<{ tenant: string; teachers: number; reminders: number }> = [];
  for (const t of tenants) {
    try {
      const r = await runAppelRemindersForTenant(t.id);
      results.push({ tenant: t.slug, ...r });
    } catch (e: unknown) {
      console.error(`[appel-reminders] tenant=${t.slug}`, e);
    }
  }
  return Response.json({ ok: true, results });
}

export const GET = POST;
