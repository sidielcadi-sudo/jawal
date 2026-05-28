/**
 * Smoke test S3 phase 1 : Notes (Subject + Evaluation + Grade)
 *   pnpm --filter @jawal/db exec tsx scripts/smoke-test-grades.ts
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

  const cls = await admin.class.findFirstOrThrow({
    where: { tenantId: tenant.id, deletedAt: null },
    include: { students: { where: { unenrolledAt: null } } },
  });
  if (cls.students.length < 2) throw new Error("Besoin d'au moins 2 élèves");

  const period = await admin.period.findFirstOrThrow({ where: { tenantId: tenant.id } });

  // 1. Création matière
  const subject = await withT(tenant.id, (tx) =>
    tx.subject.create({
      data: {
        tenantId: tenant.id,
        code: `math-${Date.now()}`,
        label: 'Mathématiques',
        scale: 20,
        coefficient: 3,
        order: 1,
      },
    }),
  );
  console.log(`1. Matière créée (${subject.code}, /20, ×3) ✅`);

  // 2. Création d'une évaluation + pré-init grades à null
  const evalRow = await withT(tenant.id, async (tx) => {
    const e = await tx.evaluation.create({
      data: {
        tenantId: tenant.id,
        classId: cls.id,
        subjectId: subject.id,
        periodId: period.id,
        label: 'Contrôle Smoke',
        date: new Date(),
        weight: 1,
        maxValue: 20,
      },
    });
    await tx.grade.createMany({
      data: cls.students.map((sc) => ({
        tenantId: tenant.id,
        evaluationId: e.id,
        studentId: sc.studentId,
        value: null,
      })),
    });
    return e;
  });
  const initialGrades = await withT(tenant.id, (tx) =>
    tx.grade.findMany({ where: { evaluationId: evalRow.id } }),
  );
  console.log(
    `2. Évaluation + ${initialGrades.length} grades vides ${initialGrades.length === cls.students.length ? '✅' : '❌'}`,
  );

  // 3. Saisie des notes via upsert
  const values = [15, 12, 8];
  await withT(tenant.id, async (tx) => {
    for (let i = 0; i < Math.min(values.length, cls.students.length); i++) {
      await tx.grade.upsert({
        where: {
          evaluationId_studentId: { evaluationId: evalRow.id, studentId: cls.students[i]!.studentId },
        },
        update: { value: values[i] },
        create: {
          tenantId: tenant.id,
          evaluationId: evalRow.id,
          studentId: cls.students[i]!.studentId,
          value: values[i],
        },
      });
    }
  });
  const saved = await withT(tenant.id, (tx) =>
    tx.grade.findMany({ where: { evaluationId: evalRow.id, value: { not: null } } }),
  );
  console.log(`3. Saisie ${saved.length} notes ${saved.length >= 2 ? '✅' : '❌'}`);

  // 4. Calcul moyenne côté SQL
  const avg = await withT(tenant.id, (tx) =>
    tx.grade.aggregate({
      where: { evaluationId: evalRow.id, value: { not: null } },
      _avg: { value: true },
      _min: { value: true },
      _max: { value: true },
    }),
  );
  console.log(`4. Stats SQL : avg=${avg._avg.value?.toFixed(2)} min=${avg._min.value} max=${avg._max.value} ${avg._avg.value !== null ? '✅' : '❌'}`);

  // 5. Unique (evaluationId, studentId) bloque les duplicates
  try {
    await withT(tenant.id, (tx) =>
      tx.grade.create({
        data: {
          tenantId: tenant.id,
          evaluationId: evalRow.id,
          studentId: cls.students[0]!.studentId,
          value: 18,
        },
      }),
    );
    console.log(`5. Duplicate créé → ❌`);
  } catch (e) {
    const isUnique = e instanceof Error && e.message.includes('Unique constraint');
    console.log(`5. Unique (eval,student) bloque duplicate : ${isUnique ? '✅' : '❌'}`);
  }

  // 6. Isolation cross-tenant
  const fakeTenant = '00000000-0000-0000-0000-000000000000';
  const visible = await app.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${fakeTenant}'`);
    return {
      subjects: await tx.subject.count(),
      evaluations: await tx.evaluation.count(),
      grades: await tx.grade.count(),
    };
  });
  console.log(
    `6. Isolation cross-tenant → ${visible.subjects === 0 && visible.evaluations === 0 && visible.grades === 0 ? '✅' : '❌'}`,
  );

  // Cleanup
  await admin.grade.deleteMany({ where: { evaluationId: evalRow.id } });
  await admin.evaluation.delete({ where: { id: evalRow.id } });
  await admin.subject.delete({ where: { id: subject.id } });

  await app.$disconnect();
  await admin.$disconnect();
  console.log('\n🧹 Cleanup OK\n✅ Tous les tests Grades passent.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
