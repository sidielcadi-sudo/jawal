import bcrypt from 'bcryptjs';
import { vi } from 'vitest';
import { testAdmin } from './setup';

export type TestTenant = {
  tenantId: string;
  userId: string;
  email: string;
};

const CORE_MODULES = ['core', 'admissions', 'scolarite', 'notes', 'classes'];

/**
 * Crée un tenant de test minimal :
 *  - Tenant ACTIVE avec profil K12
 *  - Modules core activés
 *  - Rôles tenant_admin (perm *) + enseignant
 *  - User admin lié au rôle tenant_admin
 *  - Année scolaire active + niveau + cycle (pour les tests Classes)
 */
export async function createTestTenant(overrides?: { slug?: string }): Promise<TestTenant & {
  yearId: string;
  cycleId: string;
  levelId: string;
}> {
  const slug = overrides?.slug ?? `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const tenant = await testAdmin.tenant.create({
    data: {
      slug,
      name: `Test ${slug}`,
      profile: 'K12',
      status: 'ACTIVE',
      localeDefault: 'fr',
      currency: 'MAD',
    },
  });

  await Promise.all(
    CORE_MODULES.map((code) =>
      testAdmin.tenantModule.create({ data: { tenantId: tenant.id, code } }),
    ),
  );

  const adminRole = await testAdmin.role.create({
    data: { tenantId: tenant.id, code: 'tenant_admin', label: 'Admin', permissions: ['*'], isSystem: true },
  });
  await testAdmin.role.create({
    data: {
      tenantId: tenant.id,
      code: 'enseignant',
      label: 'Enseignant',
      permissions: ['attendance.write', 'grades.write'],
      isSystem: true,
    },
  });

  const email = `admin@${slug}.test`;
  const user = await testAdmin.user.create({
    data: {
      tenantId: tenant.id,
      email,
      passwordHash: await bcrypt.hash('test1234', 10),
      emailVerified: new Date(),
    },
  });

  await testAdmin.userRole.create({
    data: { tenantId: tenant.id, userId: user.id, roleId: adminRole.id },
  });

  const year = await testAdmin.academicYear.create({
    data: {
      tenantId: tenant.id,
      label: '2025-2026',
      startDate: new Date('2025-09-01'),
      endDate: new Date('2026-07-15'),
      active: true,
    },
  });

  const cycle = await testAdmin.cycle.create({
    data: { tenantId: tenant.id, code: 'college', label: 'Collège', order: 1 },
  });
  const level = await testAdmin.level.create({
    data: { tenantId: tenant.id, cycleId: cycle.id, code: '1ac', label: '1AC', order: 1 },
  });

  return {
    tenantId: tenant.id,
    userId: user.id,
    email,
    yearId: year.id,
    cycleId: cycle.id,
    levelId: level.id,
  };
}

/**
 * Configure tous les mocks Next.js + Auth.js pour une suite de tests
 * sur Server Actions. À appeler en `beforeEach` après `vi.resetModules()`.
 *
 * - `@/lib/auth` → retourne une session forgée
 * - `@/lib/auth/rbac` → can/requirePermission permissifs (test des permissions
 *   séparé en unit tests sur hasPermission)
 * - `next/headers` → IP/UA fixes pour l'audit log
 * - `next/cache` → no-op (pas de page à invalider en test)
 * - `next/navigation` → redirect/notFound lèvent une exception identifiable
 */
export function mockNextEnv(session: {
  userId: string;
  tenantId: string;
  email: string;
  isSuperAdmin?: boolean;
  permissions?: string[];
  /**
   * Codes de rôle de l'utilisateur simulé. Nécessaire aux modules qui
   * raisonnent par rôle et non par permission (soutien scolaire, vie
   * scolaire…). Par défaut `tenant_admin`, soit l'ancien comportement.
   */
  roleCodes?: string[];
}) {
  const perms = session.permissions ?? ['*'];
  const roleCodes = session.roleCodes ?? ['tenant_admin'];

  vi.doMock('@/lib/auth', () => ({
    auth: vi.fn().mockResolvedValue({
      user: {
        id: session.userId,
        email: session.email,
        tenantId: session.tenantId,
        isSuperAdmin: session.isSuperAdmin ?? false,
      },
      expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    }),
  }));

  vi.doMock('@/lib/auth/rbac', () => ({
    currentUserPermissions: vi.fn().mockResolvedValue(perms),
    can: vi.fn(async (perm: string) => perms.includes('*') || perms.includes(perm)),
    requirePermission: vi.fn(async (perm: string) => {
      if (!perms.includes('*') && !perms.includes(perm)) {
        throw new Error(`Forbidden: missing permission "${perm}"`);
      }
    }),
    currentUserRoleCodes: vi.fn().mockResolvedValue(roleCodes),
    requireRoleCode: vi.fn(async (codes: string[]) => {
      if (!roleCodes.some((c) => codes.includes(c))) {
        throw new Error(`Forbidden: missing role among ${codes.join(', ')}`);
      }
    }),
    isDirection: vi.fn().mockResolvedValue(
      roleCodes.includes('tenant_admin') || roleCodes.includes('direction'),
    ),
    isVieScolaireOnly: vi.fn().mockResolvedValue(
      roleCodes.includes('cpe') &&
        !roleCodes.includes('tenant_admin') &&
        !roleCodes.includes('direction'),
    ),
  }));

  vi.doMock('next/headers', () => ({
    headers: vi.fn().mockResolvedValue(
      new Map([
        ['x-forwarded-for', '127.0.0.1'],
        ['user-agent', 'vitest'],
      ]),
    ),
  }));

  vi.doMock('next/cache', () => ({
    revalidatePath: vi.fn(),
    revalidateTag: vi.fn(),
  }));

  vi.doMock('next/navigation', () => ({
    redirect: vi.fn((url: string) => {
      throw new Error(`[redirect] ${url}`);
    }),
    notFound: vi.fn(() => {
      throw new Error(`[notFound]`);
    }),
  }));
}
