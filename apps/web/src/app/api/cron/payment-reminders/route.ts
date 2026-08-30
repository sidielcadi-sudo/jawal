import { NextRequest } from 'next/server';
import { prismaAdmin } from '@/lib/db';
import { runPaymentRemindersForTenant } from '@/lib/payment-reminders';
import { auth } from '@/lib/auth';

/**
 * Relances de paiement aux parents : rappel à J-3, alerte à J-1.
 *
 * À déclencher **une fois par jour**. Le job ne cible que les échéances tombant
 * exactement dans 3 jours ou dans 1 jour, et marque chaque envoi en base : le
 * relancer le même jour ne produit pas de doublon.
 *
 * Authentification identique aux autres crons : header `X-Cron-Secret` égal à
 * AUTH_SECRET, ou une session admin pour un déclenchement manuel.
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

  const results: Array<{ tenant: string; sent: number; skipped: number }> = [];
  for (const t of tenants) {
    try {
      const r = await runPaymentRemindersForTenant(t.id);
      results.push({ tenant: t.slug, ...r });
    } catch (e: unknown) {
      console.error(`[payment-reminders] tenant=${t.slug}`, e);
    }
  }
  return Response.json({ ok: true, results });
}

export const GET = POST;
