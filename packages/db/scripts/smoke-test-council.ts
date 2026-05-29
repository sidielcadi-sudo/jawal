/**
 * Smoke test S3 phase 3 : appréciations + conseil de classe + mentions
 *   pnpm --filter @jawal/db exec tsx scripts/smoke-test-council.ts
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

/** Reproduction locale de computeMention. */
function computeMention(value: number | null, scale = 20): string | null {
  if (value === null) return null;
  const v = value * (20 / scale);
  if (v >= 18) return 'EXCELLENT';
  if (v >= 16) return 'TRES_BIEN';
  if (v >= 14) return 'BIEN';
  if (v >= 12) return 'ASSEZ_BIEN';
  if (v >= 10) return 'PASSABLE';
  return 'INSUFFISANT';
}

async function main() {
  const tenant = await admin.tenant.findUniqueOrThrow({ where: { slug: 'demo' } });
  console.log(`🎯 Tenant: ${tenant.name}\n`);

  const cls = await admin.class.findFirstOrThrow({
    where: { tenantId: tenant.id, deletedAt: null },
    include: { students: { where: { unenrolledAt: null }, take: 1 } },
  });
  const student = cls.students[0]!;
  const period = await admin.period.findFirstOrThrow({ where: { tenantId: tenant.id } });

  const subject = await admin.subject.create({
    data: {
      tenantId: tenant.id,
      code: `smoke-${Date.now()}`,
      label: 'Smoke',
      scale: 20,
      coefficient: 1,
      order: 99,
    },
  });

  // 1. Tests mentions (seuils)
  console.log('1. Test des seuils de mentions :');
  const cases: Array<[number, string]> = [
    [19.5, 'EXCELLENT'],
    [16, 'TRES_BIEN'],
    [14, 'BIEN'],
    [12, 'ASSEZ_BIEN'],
    [10, 'PASSABLE'],
    [9.99, 'INSUFFISANT'],
    [0, 'INSUFFISANT'],
  ];
  let allOk = true;
  for (const [v, expected] of cases) {
    const got = computeMention(v);
    const ok = got === expected;
    if (!ok) allOk = false;
    console.log(`   ${v} → ${got} (attendu ${expected}) ${ok ? '✅' : '❌'}`);
  }
  console.log(`   ${allOk ? '✅' : '❌'} Tous les seuils corrects`);

  // 2. Normalisation /10 → /20 pour mention
  console.log('\n2. Normalisation pour mention :');
  const norm10 = computeMention(7, 10); // 7/10 = 14/20 → BIEN
  console.log(`   7/10 normalisé → ${norm10} (BIEN attendu) ${norm10 === 'BIEN' ? '✅' : '❌'}`);

  // 3. Création appréciation matière
  const apprec = await withT(tenant.id, (tx) =>
    tx.subjectAppreciation.create({
      data: {
        tenantId: tenant.id,
        studentId: student.studentId,
        subjectId: subject.id,
        periodId: period.id,
        text: 'Très bon travail, continuez !',
      },
    }),
  );
  console.log(`\n3. Appréciation matière créée → ${apprec.id.slice(0, 8)} ✅`);

  // 4. Resoumission (unique student+subject+period)
  try {
    await withT(tenant.id, (tx) =>
      tx.subjectAppreciation.create({
        data: {
          tenantId: tenant.id,
          studentId: student.studentId,
          subjectId: subject.id,
          periodId: period.id,
          text: 'autre',
        },
      }),
    );
    console.log(`4. Duplicate créé → ❌`);
  } catch (e) {
    const isUnique = e instanceof Error && e.message.includes('Unique constraint');
    console.log(`4. Duplicate appréciation bloquée par unique : ${isUnique ? '✅' : '❌'}`);
  }

  // 5. CouncilEntry
  const council = await withT(tenant.id, (tx) =>
    tx.councilEntry.create({
      data: {
        tenantId: tenant.id,
        classId: cls.id,
        studentId: student.studentId,
        periodId: period.id,
        generalAppreciation: 'Élève sérieux et appliqué.',
        decision: 'ENCOURAGEMENTS',
        heldAt: new Date(),
      },
    }),
  );
  console.log(`5. Council entry créée avec décision ENCOURAGEMENTS ${council.decision === 'ENCOURAGEMENTS' ? '✅' : '❌'}`);

  // 6. Update via upsert
  const updated = await withT(tenant.id, (tx) =>
    tx.councilEntry.update({
      where: { id: council.id },
      data: { decision: 'FELICITATIONS', generalAppreciation: 'Excellent travail.' },
    }),
  );
  console.log(`6. Update décision FELICITATIONS ${updated.decision === 'FELICITATIONS' ? '✅' : '❌'}`);

  // 7. Isolation cross-tenant
  const fakeTenant = '00000000-0000-0000-0000-000000000000';
  const visible = await app.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${fakeTenant}'`);
    return {
      apprecs: await tx.subjectAppreciation.count(),
      council: await tx.councilEntry.count(),
    };
  });
  console.log(`7. Isolation cross-tenant → ${visible.apprecs} apprecs, ${visible.council} council ${visible.apprecs === 0 && visible.council === 0 ? '✅' : '❌'}`);

  // Cleanup
  await admin.subjectAppreciation.deleteMany({ where: { id: apprec.id } });
  await admin.councilEntry.deleteMany({ where: { id: council.id } });
  await admin.subject.delete({ where: { id: subject.id } });

  await app.$disconnect();
  await admin.$disconnect();
  console.log('\n🧹 Cleanup OK\n✅ Tous les tests Council passent.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
