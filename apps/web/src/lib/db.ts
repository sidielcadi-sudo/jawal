import { prisma, prismaAdmin } from '@jawal/db';

export { prisma, prismaAdmin };
export type { Prisma } from '@jawal/db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Exécute une fonction avec une transaction où le contexte tenant
 * est positionné via `SET LOCAL app.current_tenant_id = ...`.
 * Toutes les requêtes Prisma à l'intérieur seront filtrées par la
 * politique RLS PostgreSQL. tenantId est validé en UUID strict avant
 * interpolation — `SET LOCAL` n'acceptant pas les paramètres liés.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: typeof prisma) => Promise<T>,
): Promise<T> {
  if (!UUID_RE.test(tenantId)) {
    throw new Error('withTenant: tenantId invalide (UUID attendu)');
  }
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
      return fn(tx as typeof prisma);
    },
    // Le RLS impose de tout exécuter dans une seule transaction interactive ;
    // les pages agrégées (tableau de bord) et les démarrages à froid dépassent
    // facilement le défaut Prisma de 5 s. On élargit la fenêtre (durée max de la
    // transaction) et l'attente d'un slot dans le pool.
    { timeout: 15_000, maxWait: 10_000 },
  );
}
