import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __jawalPrisma: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __jawalPrismaAdmin: PrismaClient | undefined;
}

const logLevel: ('warn' | 'error')[] =
  process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'];

/**
 * Client principal utilisé par l'application web.
 *
 * Se connecte via DATABASE_URL_APP (rôle `jawal_app`, sans BYPASSRLS).
 * Toutes les requêtes sont donc soumises aux politiques Row-Level Security
 * PostgreSQL — il faut envelopper les opérations métier dans `withTenant()`
 * (voir apps/web/src/lib/db.ts) pour positionner `app.current_tenant_id`.
 *
 * Fallback sur DATABASE_URL en dev si DATABASE_URL_APP n'est pas défini
 * (mais alors RLS est contournée si l'utilisateur est superuser — à éviter).
 */
export const prisma =
  global.__jawalPrisma ??
  new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL,
    log: logLevel,
  });

/**
 * Client admin avec privilèges étendus (DATABASE_URL → rôle superuser en dev).
 *
 * À utiliser UNIQUEMENT pour :
 *   - les migrations / le seed
 *   - les opérations super-admin SaaS (CRUD tenants)
 *   - les jobs de maintenance qui doivent voir tous les tenants
 *
 * Ne JAMAIS l'utiliser pour servir une requête utilisateur normale —
 * cela contournerait l'isolation RLS et pourrait fuiter des données
 * entre tenants.
 */
export const prismaAdmin =
  global.__jawalPrismaAdmin ??
  new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL,
    log: logLevel,
  });

if (process.env.NODE_ENV !== 'production') {
  global.__jawalPrisma = prisma;
  global.__jawalPrismaAdmin = prismaAdmin;
}

export * from '@prisma/client';
