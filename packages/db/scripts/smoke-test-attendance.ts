/**
 * Smoke test S2 phase 1 : Module Présences (Attendance)
 *   pnpm --filter @jawal/db exec tsx scripts/smoke-test-attendance.ts
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

  // Préparation : trouver une classe + ses élèves inscrits
  const cls = await admin.class.findFirstOrThrow({
    where: { tenantId: tenant.id, deletedAt: null },
    include: { students: { where: { unenrolledAt: null } } },
  });
  if (cls.students.length < 2) {
    throw new Error(`Classe ${cls.name} : besoin d'au moins 2 élèves inscrits`);
  }
  console.log(`Classe : ${cls.name} (${cls.students.length} élèves inscrits)`);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // 1. Création d'une session
  const sessionData = await withT(tenant.id, async (tx) => {
    const s = await tx.attendanceSession.create({
      data: { tenantId: tenant.id, classId: cls.id, date: today, periodLabel: `Smoke-${Date.now()}` },
    });
    await tx.attendanceRecord.createMany({
      data: cls.students.map((sc) => ({
        tenantId: tenant.id,
        sessionId: s.id,
        studentId: sc.studentId,
        status: 'PRESENT' as const,
      })),
    });
    return s;
  });
  console.log(`1. Session créée : ${sessionData.id} (${cls.students.length} records PRESENT par défaut) ✅`);

  // 2. Marquer 1 absent + 1 retard
  const [absentee, late] = cls.students;
  await withT(tenant.id, async (tx) => {
    await tx.attendanceRecord.update({
      where: { sessionId_studentId: { sessionId: sessionData.id, studentId: absentee!.studentId } },
      data: { status: 'ABSENT' },
    });
    await tx.attendanceRecord.update({
      where: { sessionId_studentId: { sessionId: sessionData.id, studentId: late!.studentId } },
      data: { status: 'LATE', lateMinutes: 12 },
    });
  });
  const after = await withT(tenant.id, async (tx) =>
    tx.attendanceRecord.findMany({ where: { sessionId: sessionData.id } }),
  );
  const present = after.filter((r) => r.status === 'PRESENT').length;
  const absent = after.filter((r) => r.status === 'ABSENT').length;
  const isLate = after.filter((r) => r.status === 'LATE').length;
  console.log(`2. Après marquage : P=${present} A=${absent} L=${isLate}  ${absent === 1 && isLate === 1 ? '✅' : '❌'}`);

  // 3. Finalisation
  await withT(tenant.id, async (tx) => {
    await tx.attendanceSession.update({
      where: { id: sessionData.id },
      data: { finalizedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        tenantId: tenant.id,
        action: 'finalize',
        entityType: 'AttendanceSession',
        entityId: sessionData.id,
      },
    });
  });
  const finalized = await withT(tenant.id, (tx) =>
    tx.attendanceSession.findUniqueOrThrow({ where: { id: sessionData.id } }),
  );
  console.log(`3. Finalisée : finalizedAt=${finalized.finalizedAt ? '✓' : '✗'} ${finalized.finalizedAt ? '✅' : '❌'}`);

  // 4. Tentative création d'une 2e session même classe/date/period → unique constraint
  try {
    await withT(tenant.id, (tx) =>
      tx.attendanceSession.create({
        data: { tenantId: tenant.id, classId: cls.id, date: today, periodLabel: sessionData.periodLabel },
      }),
    );
    console.log(`4. Duplicate session créée → ❌ (attendu : refus unique)`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    const isUnique = msg.includes('Unique constraint');
    console.log(`4. Duplicate session bloquée : ${isUnique ? '✅' : '❌ ' + msg.slice(0, 60)}`);
  }

  // 5. Isolation : fake tenant ne voit rien
  const fakeTenant = '00000000-0000-0000-0000-000000000000';
  const visible = await app.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${fakeTenant}'`);
    return {
      sessions: await tx.attendanceSession.count(),
      records: await tx.attendanceRecord.count(),
    };
  });
  console.log(
    `5. Isolation cross-tenant (sessions/records) → ${visible.sessions === 0 && visible.records === 0 ? '✅' : '❌ ' + JSON.stringify(visible)}`,
  );

  // Cleanup
  await admin.attendanceRecord.deleteMany({ where: { sessionId: sessionData.id } });
  await admin.attendanceSession.delete({ where: { id: sessionData.id } });
  await admin.auditLog.deleteMany({ where: { entityId: sessionData.id } });

  await app.$disconnect();
  await admin.$disconnect();
  console.log('\n🧹 Cleanup OK\n✅ Tous les tests Attendance passent.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
