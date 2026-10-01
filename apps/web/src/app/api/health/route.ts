import { prismaAdmin } from '@/lib/db';

/**
 * Sonde de santé : utilisée par le healthcheck Docker et par le reverse proxy.
 *
 * Elle interroge la base, car un conteneur qui répond mais ne sait plus parler
 * à Postgres n'est pas « sain » — il sert des erreurs 500 à chaque page.
 * Volontairement publique et sans détail : aucun secret, aucun numéro de
 * version, rien qui aide un scan.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await prismaAdmin.$queryRaw`SELECT 1`;
    return Response.json({ status: 'ok' });
  } catch {
    return Response.json({ status: 'degraded' }, { status: 503 });
  }
}
