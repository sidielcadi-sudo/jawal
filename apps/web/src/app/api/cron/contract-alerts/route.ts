import { NextRequest } from 'next/server';
import { prismaAdmin } from '@/lib/db';
import { runContractAlertsForTenant } from '@/lib/contract-alerts';
import { auth } from '@/lib/auth';

/**
 * Route déclenchée par un cron en prod (Vercel Cron / GitHub Actions / cron Linux).
 * Authentification :
 *   1. Header `X-Cron-Secret` égal à AUTH_SECRET (pour les vrais crons)
 *   2. OU une session admin connectée (pour déclencher manuellement depuis l'UI)
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
    select: { id: true, slug: true, name: true },
  });

  const results: Array<{ tenant: string; recipients: number; alerts: number }> = [];
  for (const t of tenants) {
    try {
      const r = await runContractAlertsForTenant(t.id);
      results.push({ tenant: t.slug, ...r });
    } catch (e: unknown) {
      console.error(`[contract-alerts] tenant=${t.slug}`, e);
    }
  }
  return Response.json({ ok: true, results });
}

export const GET = POST;
