/**
 * Setup global pour les tests d'intégration.
 * Les variables d'environnement DATABASE_URL/DATABASE_URL_APP sont
 * positionnées par vitest.integration.config.ts (env:) AVANT le chargement
 * des modules — sinon le singleton prismaAdmin de @jawal/db pointerait
 * sur la mauvaise base.
 */
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { PrismaClient } from '@jawal/db';

// Client superuser pour le reset et les fixtures (bypasse RLS).
// Utilise les env vars déjà positionnées par la config vitest.
const admin = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

const TENANT_SCOPED_TABLES = [
  'audit_logs',
  'student_classes',
  'classes',
  'levels',
  'cycles',
  'periods',
  'academic_years',
  'user_roles',
  'user_persons',
  'persons',
  'roles',
  'users',
  'tenant_modules',
  'rooms',
  'files',
  'tenants',
];

beforeAll(async () => {
  try {
    await admin.$queryRaw`SELECT 1`;
  } catch (e) {
    throw new Error(
      `DB de test introuvable. Lance "pnpm --filter @jawal/db test:setup-db" d'abord.\n${(e as Error).message}`,
    );
  }
});

beforeEach(async () => {
  const list = TENANT_SCOPED_TABLES.map((t) => `"${t}"`).join(', ');
  await admin.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await admin.$disconnect();
});

export { admin as testAdmin };
