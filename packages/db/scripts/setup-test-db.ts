/**
 * Crée et configure la base de données de test `jawal_test`.
 * Idempotent : peut être lancé plusieurs fois.
 *
 *   pnpm test:setup-db
 *
 * Étapes :
 *   1. DROP DATABASE jawal_test (si existe)
 *   2. CREATE DATABASE jawal_test
 *   3. Push le schéma Prisma vers jawal_test
 *   4. Crée le rôle jawal_app + applique RLS via rls.sql
 */
import { execSync } from 'node:child_process';
import { Client } from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const SUPERUSER_URL =
  process.env.SUPERUSER_DATABASE_URL ??
  'postgresql://jawal:jawal@localhost:5433/postgres';

const TEST_DB_NAME = 'jawal_test';
const TEST_URL = `postgresql://jawal:jawal@localhost:5433/${TEST_DB_NAME}?schema=public`;

async function main() {
  console.log('🔧 Setup DB de test : jawal_test\n');

  // 1. Drop + create
  const admin = new Client({ connectionString: SUPERUSER_URL });
  await admin.connect();
  console.log('  • Drop existing jawal_test (si présente)…');
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE)`);
  console.log('  • Create jawal_test…');
  await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
  await admin.end();

  // 2. Push schema Prisma vers la DB de test
  console.log('  • Prisma db push…');
  const schemaPath = path.join(here, '..', 'prisma', 'schema.prisma');
  execSync(`prisma db push --skip-generate --accept-data-loss`, {
    cwd: path.join(here, '..'),
    env: { ...process.env, DATABASE_URL: TEST_URL, NODE_OPTIONS: '--use-system-ca' },
    stdio: 'pipe',
  });

  // 3. Appliquer RLS + créer rôle jawal_app
  console.log('  • Apply RLS policies (rls.sql)…');
  const rlsPath = path.join(here, '..', 'prisma', 'rls.sql');
  execSync(
    `psql "${TEST_URL.replace('?schema=public', '')}" -v ON_ERROR_STOP=1 -f "${rlsPath}"`,
    {
      env: { ...process.env, PGPASSWORD: 'jawal' },
      stdio: 'pipe',
    },
  );

  console.log('\n✅ DB jawal_test prête.\n');
  console.log(`   URL superuser : ${TEST_URL}`);
  console.log(`   URL app       : postgresql://jawal_app:jawal_app@localhost:5433/${TEST_DB_NAME}\n`);
}

main().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});
