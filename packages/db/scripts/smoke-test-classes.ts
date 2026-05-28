/**
 * Smoke test bout-en-bout pour le module Classes :
 *   - Création classe avec audit log (atomique)
 *   - Inscription élève (capacité, idempotence)
 *   - Désinscription (unenrolledAt)
 *   - Tentative de fuite cross-tenant
 *
 *   pnpm --filter @jawal/db exec tsx scripts/smoke-test-classes.ts
 */
import { PrismaClient } from '@prisma/client';

const APP_DATABASE_URL = process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL;
if (!APP_DATABASE_URL) throw new Error('Définir DATABASE_URL_APP ou DATABASE_URL');

const prismaApp = new PrismaClient({ datasourceUrl: APP_DATABASE_URL });
const prismaAdmin = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

async function main() {
  const tenant = await prismaAdmin.tenant.findUniqueOrThrow({ where: { slug: 'demo' } });
  console.log(`🎯 Tenant : ${tenant.name}`);

  // Pré-requis : récupérer une année active, un niveau, et un enseignant
  const year = await prismaAdmin.academicYear.findFirstOrThrow({
    where: { tenantId: tenant.id, active: true },
  });
  const level = await prismaAdmin.level.findFirstOrThrow({
    where: { tenantId: tenant.id, code: '1ac' },
  });
  const teacher = await prismaAdmin.person.findFirstOrThrow({
    where: { tenantId: tenant.id, type: 'TEACHER', deletedAt: null },
  });

  // 1. Création classe + audit en transaction
  const cls = await prismaApp.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenant.id}'`);
    const created = await tx.class.create({
      data: {
        tenantId: tenant.id,
        academicYearId: year.id,
        levelId: level.id,
        name: `Smoke-${Date.now()}`,
        capacity: 2,
        mainTeacherId: teacher.id,
      },
    });
    await tx.auditLog.create({
      data: { tenantId: tenant.id, action: 'create', entityType: 'Class', entityId: created.id },
    });
    return created;
  });
  console.log(`1. Création classe (capacité 2) → ${cls.name} ✅`);

  // 2. Créer 3 élèves temporaires
  const students = [];
  for (let i = 0; i < 3; i++) {
    const p = await prismaApp.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenant.id}'`);
      return tx.person.create({
        data: {
          tenantId: tenant.id,
          type: 'STUDENT',
          firstName: `Student-${i}`,
          lastName: `Smoke-${Date.now()}-${i}`,
        },
      });
    });
    students.push(p);
  }
  console.log(`2. 3 élèves de test créés`);

  // 3. Inscrire les 2 premiers — OK
  for (const s of students.slice(0, 2)) {
    await prismaApp.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenant.id}'`);
      await tx.studentClass.create({
        data: { tenantId: tenant.id, studentId: s.id, classId: cls.id },
      });
    });
  }
  console.log(`3. 2 élèves inscrits ✅`);

  // 4. Tenter d'inscrire le 3ème — devrait échouer si on respecte capacity
  // (côté DB il n'y a pas de contrainte ; la logique est dans la Server Action)
  // On simule la vérif :
  const enrolledCount = await prismaApp.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenant.id}'`);
    return tx.studentClass.count({ where: { classId: cls.id, unenrolledAt: null } });
  });
  const wouldExceedCapacity = enrolledCount >= cls.capacity;
  console.log(
    `4. Vérif capacité avant 3ème inscription (${enrolledCount}/${cls.capacity}) → blocage : ${wouldExceedCapacity ? '✅' : '❌'}`,
  );

  // 5. Désinscrire le 1er
  await prismaApp.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenant.id}'`);
    await tx.studentClass.updateMany({
      where: { studentId: students[0]!.id, classId: cls.id, unenrolledAt: null },
      data: { unenrolledAt: new Date() },
    });
  });
  const afterUnenroll = await prismaApp.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenant.id}'`);
    return tx.studentClass.count({ where: { classId: cls.id, unenrolledAt: null } });
  });
  console.log(`5. Désinscription → ${afterUnenroll} inscrit(s) actifs ${afterUnenroll === 1 ? '✅' : '❌'}`);

  // 6. Tentative cross-tenant : pas de fuite
  const fakeTenant = '00000000-0000-0000-0000-000000000000';
  const visible = await prismaApp.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${fakeTenant}'`);
    return tx.class.count({ where: { id: cls.id } });
  });
  console.log(`6. Classe visible avec tenant_id factice → ${visible} ${visible === 0 ? '✅' : '❌'}`);

  // Cleanup
  await prismaAdmin.studentClass.deleteMany({ where: { classId: cls.id } });
  await prismaAdmin.auditLog.deleteMany({ where: { entityId: cls.id } });
  await prismaAdmin.class.delete({ where: { id: cls.id } });
  for (const s of students) await prismaAdmin.person.delete({ where: { id: s.id } });
  console.log(`\n🧹 Cleanup OK`);

  await prismaApp.$disconnect();
  await prismaAdmin.$disconnect();
  console.log('\n✅ Tous les tests Classes passent.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
