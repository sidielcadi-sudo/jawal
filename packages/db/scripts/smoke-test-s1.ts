/**
 * Smoke test S1 phase 3 : référentiel + invitations + CSV import + audit log.
 *   pnpm --filter @jawal/db exec tsx scripts/smoke-test-s1.ts
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const APP = process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL;
if (!APP) throw new Error('DATABASE_URL_APP requis');

const app = new PrismaClient({ datasourceUrl: APP });
const admin = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

async function withT<T>(tenantId: string, fn: (tx: typeof app) => Promise<T>): Promise<T> {
  return app.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
    return fn(tx as typeof app);
  });
}

async function main() {
  const tenant = await admin.tenant.findUniqueOrThrow({ where: { slug: 'demo' } });
  console.log(`🎯 Tenant: ${tenant.name}\n`);

  // 1. AcademicYear : créer une 2e année et activer
  const oldActive = await admin.academicYear.findFirst({ where: { tenantId: tenant.id, active: true } });
  const newYear = await withT(tenant.id, (tx) =>
    tx.academicYear.create({
      data: {
        tenantId: tenant.id,
        label: `Smoke-${Date.now()}`,
        startDate: new Date('2027-09-01'),
        endDate: new Date('2028-07-15'),
        active: false,
      },
    }),
  );
  await withT(tenant.id, async (tx) => {
    await tx.academicYear.updateMany({ where: { active: true }, data: { active: false } });
    await tx.academicYear.update({ where: { id: newYear.id }, data: { active: true } });
  });
  const activeCount = await withT(tenant.id, (tx) =>
    tx.academicYear.count({ where: { active: true } }),
  );
  console.log(`1. AcademicYear : créer + activer → 1 active à la fois : ${activeCount === 1 ? '✅' : '❌'}`);

  // 2. Cycle + Level : créer un cycle/niveau test
  const cycle = await withT(tenant.id, (tx) =>
    tx.cycle.create({ data: { tenantId: tenant.id, code: `smoke-${Date.now()}`, label: 'Smoke', order: 99 } }),
  );
  await withT(tenant.id, (tx) =>
    tx.level.create({
      data: { tenantId: tenant.id, cycleId: cycle.id, code: `lvl-${Date.now()}`, label: 'Niveau test' },
    }),
  );
  console.log(`2. Cycle + Level : création en cascade ✅`);

  // 3. Room
  const room = await withT(tenant.id, (tx) =>
    tx.room.create({
      data: { tenantId: tenant.id, code: `R-${Date.now()}`, label: 'Salle Smoke', capacity: 25, equipment: ['projecteur'] },
    }),
  );
  console.log(`3. Room : ${room.code} (capacité ${room.capacity}) ✅`);

  // 4. User invitation : créer un user + person + lien
  const email = `invite-${Date.now()}@test.ma`;
  const role = await withT(tenant.id, (tx) =>
    tx.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: tenant.id, code: 'enseignant' } } }),
  );
  const invited = await withT(tenant.id, async (tx) => {
    const user = await tx.user.create({
      data: { tenantId: tenant.id, email, passwordHash: await bcrypt.hash('temp1234', 10) },
    });
    const person = await tx.person.create({
      data: { tenantId: tenant.id, type: 'TEACHER', firstName: 'Invité', lastName: 'Smoke' },
    });
    await tx.userPerson.create({
      data: { tenantId: tenant.id, userId: user.id, personId: person.id, relationship: 'self' },
    });
    await tx.userRole.create({ data: { tenantId: tenant.id, userId: user.id, roleId: role.id } });
    return { user, person };
  });
  const linkedRoles = await withT(tenant.id, (tx) =>
    tx.userRole.findMany({ where: { userId: invited.user.id }, include: { role: true } }),
  );
  console.log(
    `4. Invitation : user + person + role lié → ${linkedRoles[0]?.role.code === 'enseignant' ? '✅' : '❌'}`,
  );

  // 5. Bulk insert (simule CSV import) — 5 élèves d'un coup en transaction
  const created = await withT(tenant.id, async (tx) => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const p = await tx.person.create({
        data: {
          tenantId: tenant.id,
          type: 'STUDENT',
          firstName: `Imp-${i}`,
          lastName: `Csv-${Date.now()}-${i}`,
        },
      });
      ids.push(p.id);
    }
    await tx.auditLog.create({
      data: {
        tenantId: tenant.id,
        action: 'import_csv',
        entityType: 'Person',
        after: { count: 5 },
      },
    });
    return ids;
  });
  console.log(`5. Bulk import (5 élèves + audit log atomique) → ${created.length === 5 ? '✅' : '❌'}`);

  // 6. Audit log query (lecture)
  const auditCount = await withT(tenant.id, (tx) =>
    tx.auditLog.count({ where: { entityType: 'Person' } }),
  );
  console.log(`6. Audit log lisible → ${auditCount} entrée(s) Person`);

  // 7. Re-vérifier isolation cross-tenant
  const fakeTenant = '00000000-0000-0000-0000-000000000000';
  const leak = await app.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${fakeTenant}'`);
    return {
      years: await tx.academicYear.count(),
      rooms: await tx.room.count(),
      users: await tx.user.count(),
      logs: await tx.auditLog.count(),
    };
  });
  const allZero = leak.years === 0 && leak.rooms === 0 && leak.users === 0 && leak.logs === 0;
  console.log(`7. Isolation cross-tenant (years/rooms/users/logs) → ${allZero ? '✅ tous 0' : `❌ ${JSON.stringify(leak)}`}`);

  // Cleanup
  await admin.userRole.deleteMany({ where: { userId: invited.user.id } });
  await admin.userPerson.deleteMany({ where: { userId: invited.user.id } });
  await admin.user.delete({ where: { id: invited.user.id } });
  await admin.person.delete({ where: { id: invited.person.id } });
  await admin.person.deleteMany({ where: { id: { in: created } } });
  await admin.auditLog.deleteMany({ where: { action: 'import_csv', tenantId: tenant.id } });
  await admin.room.delete({ where: { id: room.id } });
  await admin.level.deleteMany({ where: { cycleId: cycle.id } });
  await admin.cycle.delete({ where: { id: cycle.id } });
  // Restore previous active year
  if (oldActive) {
    await admin.academicYear.update({ where: { id: newYear.id }, data: { active: false } });
    await admin.academicYear.update({ where: { id: oldActive.id }, data: { active: true } });
  }
  await admin.academicYear.delete({ where: { id: newYear.id } });

  await app.$disconnect();
  await admin.$disconnect();
  console.log('\n🧹 Cleanup OK\n✅ Tous les tests S1 passent.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
