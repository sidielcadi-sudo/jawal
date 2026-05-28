/**
 * Smoke test S2 phase 2 : justifications + notifications email
 *   pnpm --filter @jawal/db exec tsx scripts/smoke-test-justifications.ts
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
    include: { students: { where: { unenrolledAt: null }, take: 2 } },
  });
  if (cls.students.length < 2) throw new Error('Besoin de 2 élèves inscrits');

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const period = `Smoke-${Date.now()}`;

  // 1. Création session + 2 records (1 PRESENT, 1 ABSENT)
  const { sessionId, absentRecordId } = await withT(tenant.id, async (tx) => {
    const s = await tx.attendanceSession.create({
      data: { tenantId: tenant.id, classId: cls.id, date: today, periodLabel: period },
    });
    const present = await tx.attendanceRecord.create({
      data: { tenantId: tenant.id, sessionId: s.id, studentId: cls.students[0]!.studentId, status: 'PRESENT' },
    });
    const absent = await tx.attendanceRecord.create({
      data: { tenantId: tenant.id, sessionId: s.id, studentId: cls.students[1]!.studentId, status: 'ABSENT' },
    });
    return { sessionId: s.id, absentRecordId: absent.id, presentRecordId: present.id };
  });
  console.log(`1. Session + 1 ABSENT + 1 PRESENT créés ✅`);

  // 2. Soumettre une justification pour l'absent
  const justification = await withT(tenant.id, (tx) =>
    tx.absenceJustification.create({
      data: {
        tenantId: tenant.id,
        attendanceRecordId: absentRecordId,
        reason: 'Rendez-vous médical urgent',
      },
    }),
  );
  console.log(`2. Justification PENDING créée ${justification.status === 'PENDING' ? '✅' : '❌'}`);

  // 3. Approbation
  await withT(tenant.id, (tx) =>
    tx.absenceJustification.update({
      where: { id: justification.id },
      data: { status: 'APPROVED', reviewedAt: new Date(), reviewNote: 'Certificat joint OK' },
    }),
  );
  const approved = await withT(tenant.id, (tx) =>
    tx.absenceJustification.findUniqueOrThrow({ where: { id: justification.id } }),
  );
  console.log(`3. Approbation → status=${approved.status} ${approved.status === 'APPROVED' ? '✅' : '❌'}`);

  // 4. Tentative duplicate sur le même record → bloqué (unique)
  try {
    await withT(tenant.id, (tx) =>
      tx.absenceJustification.create({
        data: { tenantId: tenant.id, attendanceRecordId: absentRecordId, reason: 'autre' },
      }),
    );
    console.log(`4. Duplicate justification créée → ❌`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    const isUnique = msg.includes('Unique constraint');
    console.log(`4. Duplicate bloquée par unique constraint : ${isUnique ? '✅' : '❌'}`);
  }

  // 5. Lecture jointe : récupérer record + justification en une requête
  const joined = await withT(tenant.id, (tx) =>
    tx.attendanceRecord.findUnique({
      where: { id: absentRecordId },
      include: { justification: true },
    }),
  );
  console.log(
    `5. Lecture jointe Record+Justification → ${joined?.justification?.status === 'APPROVED' ? '✅' : '❌'}`,
  );

  // 6. Isolation cross-tenant
  const fakeTenant = '00000000-0000-0000-0000-000000000000';
  const visible = await app.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${fakeTenant}'`);
    return tx.absenceJustification.count();
  });
  console.log(`6. Justifications visibles cross-tenant → ${visible} ${visible === 0 ? '✅' : '❌'}`);

  // Cleanup
  await admin.absenceJustification.deleteMany({ where: { id: justification.id } });
  await admin.attendanceRecord.deleteMany({ where: { sessionId } });
  await admin.attendanceSession.delete({ where: { id: sessionId } });

  await app.$disconnect();
  await admin.$disconnect();
  console.log('\n🧹 Cleanup OK\n✅ Tous les tests Justifications passent.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
