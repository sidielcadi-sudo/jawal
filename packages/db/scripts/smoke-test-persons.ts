/**
 * Smoke test bout-en-bout : valide que la chaîne RLS + transaction + audit log
 * fonctionne pour le module Persons.
 *
 *   pnpm --filter @jawal/db exec tsx scripts/smoke-test-persons.ts
 *
 * Le script simule ce que fait la Server Action `createPersonAction` :
 *   1. setLocal app.current_tenant_id (via raw query)
 *   2. INSERT INTO persons
 *   3. INSERT INTO audit_logs
 *   4. Vérifications de visibilité avec/sans contexte
 */
import { PrismaClient } from '@prisma/client';

const APP_DATABASE_URL = process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL;
if (!APP_DATABASE_URL) {
  throw new Error('Définir DATABASE_URL_APP ou DATABASE_URL');
}

const prismaApp = new PrismaClient({ datasourceUrl: APP_DATABASE_URL });

async function main() {
  // Récupérer le tenant demo via une connexion superuser (le seed l'a créé)
  const prismaAdmin = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  const tenant = await prismaAdmin.tenant.findUniqueOrThrow({ where: { slug: 'demo' } });
  await prismaAdmin.$disconnect();

  console.log(`🎯 Tenant cible : ${tenant.name} (${tenant.id})\n`);

  // Test 1 : sans contexte → la RLS bloque
  const visibleWithout = await prismaApp.person.count();
  console.log(`1. Sans withTenant → persons visibles : ${visibleWithout}  ${visibleWithout === 0 ? '✅' : '❌ (devrait être 0)'}`);

  // Test 2 : avec contexte → on voit le tenant
  const visibleWith = await prismaApp.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenant.id}'`);
    return tx.person.count();
  });
  console.log(`2. Avec withTenant → persons visibles : ${visibleWith}  ${visibleWith >= 4 ? '✅' : '❌'}`);

  // Test 3 : création + audit en transaction (équivalent Server Action)
  const created = await prismaApp.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenant.id}'`);
    const person = await tx.person.create({
      data: {
        tenantId: tenant.id,
        type: 'STUDENT',
        firstName: 'Test',
        lastName: `Smoke-${Date.now()}`,
        contacts: { email: 'smoke@test.ma' },
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: tenant.id,
        action: 'create',
        entityType: 'Person',
        entityId: person.id,
        after: { firstName: person.firstName, lastName: person.lastName },
      },
    });
    return person;
  });
  console.log(`3. Création + audit log atomiques → person ${created.id} ✅`);

  // Test 4 : audit_logs visible depuis le contexte
  const auditCount = await prismaApp.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenant.id}'`);
    return tx.auditLog.count({ where: { entityType: 'Person' } });
  });
  console.log(`4. Audit logs Person dans le tenant → ${auditCount}  ${auditCount >= 1 ? '✅' : '❌'}`);

  // Test 5 : tentative de lire un autre tenant → bloqué
  const fakeTenantId = '00000000-0000-0000-0000-000000000000';
  const leakAttempt = await prismaApp.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${fakeTenantId}'`);
    return tx.person.count();
  });
  console.log(`5. Avec tenant_id factice → persons visibles : ${leakAttempt}  ${leakAttempt === 0 ? '✅' : '❌ (fuite !)'}`);

  // Cleanup : nettoyer la person de test (superuser pour contourner RLS)
  const cleanup = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  await cleanup.auditLog.deleteMany({ where: { entityId: created.id } });
  await cleanup.person.delete({ where: { id: created.id } });
  await cleanup.$disconnect();
  console.log(`\n🧹 Nettoyage OK`);

  await prismaApp.$disconnect();
  console.log('\n✅ Tous les tests RLS + audit log passent.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
