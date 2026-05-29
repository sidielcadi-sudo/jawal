/**
 * Smoke test : programme par niveau (CurriculumSubject) + intégration coef
 *   pnpm --filter @jawal/db exec tsx scripts/smoke-test-curriculum.ts
 */
import { PrismaClient } from '@prisma/client';

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

  // 1. Programme 1AC : 5 matières seedées
  const level1ac = await withT(tenant.id, (tx) =>
    tx.level.findUniqueOrThrow({ where: { tenantId_code: { tenantId: tenant.id, code: '1ac' } } }),
  );
  const programme = await withT(tenant.id, (tx) =>
    tx.curriculumSubject.findMany({
      where: { levelId: level1ac.id },
      include: { subject: true },
      orderBy: { order: 'asc' },
    }),
  );
  const ok1 = programme.length === 5;
  console.log(`1. Programme 1AC : ${programme.length} matières ${ok1 ? '✅' : '❌'}`);

  // 2. Total des heures hebdo = 19 (5+4+5+3+2)
  const totalHours = programme.reduce((s, p) => s + p.weeklyHours, 0);
  const ok2 = totalHours === 19;
  console.log(`2. Total volume hebdo : ${totalHours}h ${ok2 ? '✅' : '❌'}`);

  // 3. Maths a coef 4 + 5h
  const maths = programme.find((p) => p.subject.code === 'math');
  const ok3 = !!maths && maths.coefficient === 4 && maths.weeklyHours === 5;
  console.log(`3. Maths 1AC : coef=${maths?.coefficient} heures=${maths?.weeklyHours} ${ok3 ? '✅' : '❌'}`);

  // 4. Unique constraint (level, subject) — ne peut pas insérer en double
  let ok4 = false;
  try {
    await withT(tenant.id, (tx) =>
      tx.curriculumSubject.create({
        data: {
          tenantId: tenant.id,
          levelId: level1ac.id,
          subjectId: maths!.subjectId,
          weeklyHours: 99,
          coefficient: 99,
        },
      }),
    );
  } catch {
    ok4 = true;
  }
  console.log(`4. Unique (level, subject) → insert en double rejeté ${ok4 ? '✅' : '❌'}`);

  // 5. Subject.coefficient (=4 sur Maths d'après seed) — la valeur du programme prime
  const subjectMaths = await withT(tenant.id, (tx) =>
    tx.subject.findUniqueOrThrow({ where: { tenantId_code: { tenantId: tenant.id, code: 'math' } } }),
  );
  const ok5 = subjectMaths.coefficient === 4 && maths!.coefficient === 4;
  console.log(`5. Coef Subject=${subjectMaths.coefficient} vs Programme=${maths?.coefficient} (cohérent) ${ok5 ? '✅' : '❌'}`);

  // 6. Isolation cross-tenant
  const fakeTenant = '00000000-0000-0000-0000-000000000000';
  const visible = await app.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${fakeTenant}'`);
    return { entries: await tx.curriculumSubject.count() };
  });
  const ok6 = visible.entries === 0;
  console.log(`6. Isolation cross-tenant → ${JSON.stringify(visible)} ${ok6 ? '✅' : '❌'}`);

  await app.$disconnect();
  await admin.$disconnect();
  const all = ok1 && ok2 && ok3 && ok4 && ok5 && ok6;
  console.log(`\n${all ? '✅ Tous les tests passent.' : '❌ Au moins un test KO.'}`);
  if (!all) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
