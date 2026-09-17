import { NextRequest } from 'next/server';
import { prismaAdmin } from '@/lib/db';
import { runExamRemindersForTenant } from '@/lib/exam-notify';
import { auth } from '@/lib/auth';

/**
 * Rappel des sessions d'examen à J-3 : e-mail aux parents et aux élèves, alerte
 * dans leur espace.
 *
 * À déclencher **une fois par jour**, comme les autres crons. Idempotent : un
 * rappel déjà envoyé pour une session n'est pas renvoyé.
 *
 * Authentification : header `X-Cron-Secret` égal à AUTH_SECRET, ou une session
 * admin pour un déclenchement manuel.
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

  const results: Array<{ tenant: string; sessions: number; sent: number; skipped: number }> = [];
  for (const t of tenants) {
    try {
      const r = await runExamRemindersForTenant(t.id);
      results.push({ tenant: t.slug, ...r });
    } catch (e: unknown) {
      console.error(`[exam-reminders] tenant=${t.slug}`, e);
    }
  }
  return Response.json({ ok: true, results });
}

export const GET = POST;
