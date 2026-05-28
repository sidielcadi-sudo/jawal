/**
 * Global setup E2E :
 *  - Reset complet de la DB jawal_e2e
 *  - Seed minimal : 1 tenant `e2e`, 1 admin, 1 super-admin, structure pédago
 *
 * Lancé une fois avant chaque run Playwright via la dépendance `setup`.
 */
import { test as setup } from '@playwright/test';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@jawal/db';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const E2E_URL = 'postgresql://jawal:jawal@localhost:5433/jawal_e2e?schema=public';
const PG_ENV = { ...process.env, PGPASSWORD: 'jawal' };

setup('reset DB e2e + seed', async () => {
  setup.setTimeout(120_000);

  // 1. Drop + create via psql (pas de dépendance pg supplémentaire)
  execSync(
    `psql -h localhost -p 5433 -U jawal -d postgres -c "DROP DATABASE IF EXISTS jawal_e2e WITH (FORCE)"`,
    { env: PG_ENV, stdio: 'pipe' },
  );
  execSync(
    `psql -h localhost -p 5433 -U jawal -d postgres -c "CREATE DATABASE jawal_e2e"`,
    { env: PG_ENV, stdio: 'pipe' },
  );

  // 2. Prisma db push
  const pkgDbDir = path.resolve(__dirname, '..', '..', '..', 'packages', 'db');
  execSync(`prisma db push --skip-generate --accept-data-loss`, {
    cwd: pkgDbDir,
    env: { ...process.env, DATABASE_URL: E2E_URL, NODE_OPTIONS: '--use-system-ca' },
    stdio: 'pipe',
  });

  // 3. RLS
  const rlsPath = path.join(pkgDbDir, 'prisma', 'rls.sql');
  execSync(
    `psql "${E2E_URL.replace('?schema=public', '')}" -v ON_ERROR_STOP=1 -f "${rlsPath}"`,
    { env: { ...process.env, PGPASSWORD: 'jawal' }, stdio: 'pipe' },
  );

  // 4. Seed minimal
  const prisma = new PrismaClient({ datasourceUrl: E2E_URL });
  try {
    const tenant = await prisma.tenant.create({
      data: {
        slug: 'e2e',
        name: 'Établissement E2E',
        profile: 'K12',
        status: 'ACTIVE',
        localeDefault: 'fr',
        currency: 'MAD',
      },
    });

    for (const code of ['core', 'scolarite', 'classes', 'admissions', 'notes']) {
      await prisma.tenantModule.create({ data: { tenantId: tenant.id, code } });
    }

    const adminRole = await prisma.role.create({
      data: {
        tenantId: tenant.id,
        code: 'tenant_admin',
        label: 'Admin',
        permissions: ['*'],
        isSystem: true,
      },
    });
    await prisma.role.create({
      data: {
        tenantId: tenant.id,
        code: 'enseignant',
        label: 'Enseignant',
        permissions: ['attendance.write', 'grades.write'],
        isSystem: true,
      },
    });

    // Admin tenant : admin@e2e.test / e2e1234
    const hash = await bcrypt.hash('e2e1234', 10);
    const adminUser = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'admin@e2e.test',
        passwordHash: hash,
        emailVerified: new Date(),
      },
    });
    await prisma.userRole.create({
      data: { tenantId: tenant.id, userId: adminUser.id, roleId: adminRole.id },
    });

    // Super-admin : super@e2e.test / e2e1234
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'super@e2e.test',
        passwordHash: hash,
        emailVerified: new Date(),
        isSuperAdmin: true,
      },
    });

    // Structure pédagogique
    const year = await prisma.academicYear.create({
      data: {
        tenantId: tenant.id,
        label: '2025-2026',
        startDate: new Date('2025-09-01'),
        endDate: new Date('2026-07-15'),
        active: true,
      },
    });
    const cycle = await prisma.cycle.create({
      data: { tenantId: tenant.id, code: 'college', label: 'Collège', order: 1 },
    });
    await prisma.level.create({
      data: { tenantId: tenant.id, cycleId: cycle.id, code: '1ac', label: '1AC', order: 1 },
    });

    // Un enseignant pour le formulaire Classes
    await prisma.person.create({
      data: {
        tenantId: tenant.id,
        type: 'TEACHER',
        firstName: 'E2E',
        lastName: 'Teacher',
      },
    });

    console.log(`✓ DB jawal_e2e seeded (year=${year.label}, tenant=${tenant.slug})`);
  } finally {
    await prisma.$disconnect();
  }
});
