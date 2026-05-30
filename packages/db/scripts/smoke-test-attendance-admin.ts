/**
 * Smoke test S6 phase 1 : Vue admin Présences (agrégation jour + file justifications).
 *   pnpm --filter @jawal/db exec tsx scripts/smoke-test-attendance-admin.ts
 *
 * Ce test vérifie que les requêtes utilisées par /admin/attendance et
 * /admin/attendance/justifications retournent bien les compteurs attendus,
 * sans dépendre du dashboard /admin déjà couvert par smoke-test-bi.
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

  const activeYear = await admin.academicYear.findFirstOrThrow({
    where: { tenantId: tenant.id, active: true },
  });

  // On teste sur 1 classe peuplée (cA, session finalisée) + 1 classe vide (cB,
  // pas de session du tout). Le scénario vérifie l'agrégation et la détection
  // "session non faite" — équivalent du rendu /admin/attendance.
  const classes = await admin.class.findMany({
    where: { tenantId: tenant.id, academicYearId: activeYear.id, deletedAt: null },
    include: { students: { where: { unenrolledAt: null } } },
    orderBy: { name: 'asc' },
  });
  const populated = classes.filter((c) => c.students.length >= 3);
  if (populated.length < 1 || classes.length < 2) {
    throw new Error(
      `Besoin d'au moins 1 classe peuplée (≥3 élèves) et 2 classes au total (trouvé ${populated.length} peuplée, ${classes.length} totales).`,
    );
  }
  const cA = populated[0];
  const cB = classes.find((c) => c.id !== cA.id)!;
  console.log(`Classes choisies : ${cA.name} (${cA.students.length} élèves) + ${cB.name} (${cB.students.length} élèves, sans session)`);

  // Utilise une date isolée pour éviter de conflit avec les sessions seed
  const testDate = new Date('2099-12-31T00:00:00.000Z');
  const stamp = `s6smoke-${Date.now()}`;

  // Cleanup éventuel d'un run précédent
  await admin.attendanceSession.deleteMany({
    where: { classId: { in: [cA.id, cB.id] }, date: testDate },
  });

  // Setup : sur cA, 1 session finalisée avec 1 absent + 1 retard + le reste présent
  // + 2 justifications (1 PENDING, 1 APPROVED) sur les 2 absents/retards.
  await withT(tenant.id, async (tx) => {
    const sA = await tx.attendanceSession.create({
      data: {
        tenantId: tenant.id,
        classId: cA.id,
        date: testDate,
        periodLabel: `${stamp}-A`,
        finalizedAt: new Date(),
      },
    });
    await tx.attendanceRecord.createMany({
      data: cA.students.map((sc, idx) => ({
        tenantId: tenant.id,
        sessionId: sA.id,
        studentId: sc.studentId,
        status:
          idx === 0 ? ('ABSENT' as const) : idx === 1 ? ('LATE' as const) : ('PRESENT' as const),
        lateMinutes: idx === 1 ? 10 : null,
      })),
    });

    const recAbsentA = await tx.attendanceRecord.findFirstOrThrow({
      where: { sessionId: sA.id, status: 'ABSENT' },
    });
    const recLateA = await tx.attendanceRecord.findFirstOrThrow({
      where: { sessionId: sA.id, status: 'LATE' },
    });
    await tx.absenceJustification.create({
      data: {
        tenantId: tenant.id,
        attendanceRecordId: recAbsentA.id,
        reason: 'Smoke test PENDING',
        status: 'PENDING',
      },
    });
    await tx.absenceJustification.create({
      data: {
        tenantId: tenant.id,
        attendanceRecordId: recLateA.id,
        reason: 'Smoke test APPROVED',
        status: 'APPROVED',
        reviewedAt: new Date(),
      },
    });
  });

  // 1. Agrégation par classe pour la journée — équivalent du calcul page.tsx
  const rows = await withT(tenant.id, async (tx) => {
    const list = await tx.class.findMany({
      where: { academicYearId: activeYear.id, deletedAt: null, id: { in: [cA.id, cB.id] } },
      include: {
        attendanceSessions: { where: { date: testDate }, include: { records: true } },
      },
    });
    return list.map((cls) => {
      const sess = cls.attendanceSessions[0] ?? null;
      const records = sess?.records ?? [];
      return {
        id: cls.id,
        name: cls.name,
        finalized: !!sess?.finalizedAt,
        absent: records.filter((r) => r.status === 'ABSENT').length,
        late: records.filter((r) => r.status === 'LATE').length,
        present: records.filter((r) => r.status === 'PRESENT').length,
      };
    });
  });
  const rowA = rows.find((r) => r.id === cA.id)!;
  const rowB = rows.find((r) => r.id === cB.id)!;
  const ok1 = rowA.finalized && rowA.absent === 1 && rowA.late === 1;
  console.log(
    `1. ${cA.name} finalisé · 1 absent · 1 retard : ${ok1 ? '✅' : `❌ (got finalized=${rowA.finalized}, absent=${rowA.absent}, late=${rowA.late})`}`,
  );
  // cB n'a pas de session ce jour-là → doit être détecté comme "non fait"
  const ok2 = !rowB.finalized && rowB.absent === 0 && rowB.present === 0;
  console.log(
    `2. ${cB.name} sans session ce jour (status "non fait") : ${ok2 ? '✅' : `❌ (got finalized=${rowB.finalized}, present=${rowB.present})`}`,
  );

  // 3. Compteurs justifications par statut — équivalent file vie scolaire
  const counts = await withT(tenant.id, async (tx) => ({
    pending: await tx.absenceJustification.count({ where: { status: 'PENDING' } }),
    approved: await tx.absenceJustification.count({ where: { status: 'APPROVED' } }),
  }));
  const ok3 = counts.pending >= 1 && counts.approved >= 1;
  console.log(
    `3. Compteurs justifications : pending=${counts.pending}, approved=${counts.approved} ${ok3 ? '✅' : '❌'}`,
  );

  // 4. La liste PENDING contient bien le record qu'on a créé (vérification du JOIN)
  const pending = await withT(tenant.id, async (tx) =>
    tx.absenceJustification.findMany({
      where: { status: 'PENDING' },
      include: {
        attendanceRecord: {
          include: { session: { include: { class: true } }, student: true },
        },
      },
    }),
  );
  const ours = pending.find((p) => p.reason === 'Smoke test PENDING');
  const ok4 =
    !!ours &&
    ours.attendanceRecord.session.class.id === cA.id &&
    ours.attendanceRecord.status === 'ABSENT';
  console.log(
    `4. JOIN justification→record→class : ${ok4 ? '✅' : '❌'} (${ours?.attendanceRecord.session.class.name ?? '∅'})`,
  );

  // 5. Isolation tenant — vérifier qu'un tenant fictif ne voit rien
  const fakeTenant = '00000000-0000-0000-0000-000000000000';
  const visible = await app.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${fakeTenant}'`);
    return {
      sessions: await tx.attendanceSession.count(),
      justifications: await tx.absenceJustification.count(),
    };
  });
  const ok5 = visible.sessions === 0 && visible.justifications === 0;
  console.log(`5. Isolation cross-tenant → ${JSON.stringify(visible)} ${ok5 ? '✅' : '❌'}`);

  // Cleanup
  await admin.attendanceSession.deleteMany({
    where: { classId: { in: [cA.id, cB.id] }, date: testDate },
  });

  await app.$disconnect();
  await admin.$disconnect();
  const all = ok1 && ok2 && ok3 && ok4 && ok5;
  console.log(`\n${all ? '✅ Tous les tests passent.' : '❌ Au moins un test KO.'}`);
  if (!all) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
