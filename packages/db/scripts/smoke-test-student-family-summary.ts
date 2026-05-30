/**
 * Smoke test S6 phase 3 : Récap élève (fiche STUDENT) + vue famille (fiche PARENT).
 *   pnpm --filter @jawal/db exec tsx scripts/smoke-test-student-family-summary.ts
 *
 * Vérifie que les agrégations utilisées par /admin/persons/[id] (sections
 * studentAttendance + family.title) retournent des données cohérentes :
 *  - Yassine Benani (STUDENT) : on lui crée 2 sessions (1 PRESENT + 1 ABSENT
 *    avec justification PENDING) et on vérifie taux + recentAbsences.
 *  - Hassan Benani (PARENT) : on vérifie la vue famille — count enfants,
 *    classe pour chacun, taux présence agrégé, reste dû.
 */
import { PrismaClient, PersonType } from '@prisma/client';

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

  // 1. Récupère Yassine Benani et Hassan Benani
  const yassine = await admin.person.findFirstOrThrow({
    where: { tenantId: tenant.id, type: PersonType.STUDENT, firstName: 'Yassine', lastName: 'Benani' },
  });
  const hassan = await admin.person.findFirstOrThrow({
    where: { tenantId: tenant.id, type: PersonType.PARENT, firstName: 'Hassan', lastName: 'Benani' },
    include: { relationsAsParent: { include: { child: true } } },
  });
  const cls = await admin.studentClass.findFirstOrThrow({
    where: { studentId: yassine.id, unenrolledAt: null },
    include: { class: true },
  });

  console.log(`Yassine = ${yassine.firstName} ${yassine.lastName} (classe ${cls.class.name})`);
  console.log(`Hassan a ${hassan.relationsAsParent.length} enfant(s) rattaché(s)\n`);

  // Setup : créer 2 sessions isolées pour Yassine — date isolée pour éviter
  // de polluer les comptages existants.
  const testDate1 = new Date('2099-12-29T00:00:00.000Z');
  const testDate2 = new Date('2099-12-30T00:00:00.000Z');
  const stamp = `s6p3-${Date.now()}`;

  // Cleanup éventuel run précédent
  await admin.attendanceSession.deleteMany({
    where: { classId: cls.classId, date: { in: [testDate1, testDate2] } },
  });

  // Étend la période active si besoin pour inclure les dates test
  const originalEndDate = activeYear.endDate;
  const needExtend = originalEndDate.getTime() < testDate2.getTime();
  if (needExtend) {
    await admin.academicYear.update({
      where: { id: activeYear.id },
      data: { endDate: new Date('2099-12-31T00:00:00.000Z') },
    });
    // Refresh pour que les requêtes famille en aval voient la nouvelle endDate
    activeYear.endDate = new Date('2099-12-31T00:00:00.000Z');
  }

  await withT(tenant.id, async (tx) => {
    const s1 = await tx.attendanceSession.create({
      data: {
        tenantId: tenant.id,
        classId: cls.classId,
        date: testDate1,
        periodLabel: `${stamp}-1`,
        finalizedAt: new Date(),
      },
    });
    await tx.attendanceRecord.create({
      data: {
        tenantId: tenant.id,
        sessionId: s1.id,
        studentId: yassine.id,
        status: 'PRESENT',
      },
    });

    const s2 = await tx.attendanceSession.create({
      data: {
        tenantId: tenant.id,
        classId: cls.classId,
        date: testDate2,
        periodLabel: `${stamp}-2`,
        finalizedAt: new Date(),
      },
    });
    const recAbsent = await tx.attendanceRecord.create({
      data: {
        tenantId: tenant.id,
        sessionId: s2.id,
        studentId: yassine.id,
        status: 'ABSENT',
      },
    });
    await tx.absenceJustification.create({
      data: {
        tenantId: tenant.id,
        attendanceRecordId: recAbsent.id,
        reason: 'Test S6 phase 3 — PENDING',
        status: 'PENDING',
      },
    });
  });

  // 2. Reproduire la requête de la fiche élève
  const studentSummary = await withT(tenant.id, async (tx) => {
    const records = await tx.attendanceRecord.findMany({
      where: {
        studentId: yassine.id,
        session: { date: { gte: testDate1, lte: testDate2 } }, // restreint au test
      },
      include: {
        session: { include: { class: { select: { name: true } } } },
        justification: { select: { status: true } },
      },
      orderBy: { session: { date: 'desc' } },
    });
    const total = records.length;
    const present = records.filter((r) => r.status === 'PRESENT').length;
    const absent = records.filter((r) => r.status === 'ABSENT').length;
    const rate = total > 0 ? (present / total) * 100 : null;
    const recentAbsences = records.filter((r) => r.status !== 'PRESENT');
    return { total, present, absent, rate, recentAbsences };
  });

  const ok1 = studentSummary.total === 2 && studentSummary.present === 1 && studentSummary.absent === 1;
  console.log(
    `1. Yassine : 2 records (1 PRESENT, 1 ABSENT) : ${studentSummary.total} / ${studentSummary.present} / ${studentSummary.absent} ${ok1 ? '✅' : '❌'}`,
  );
  const ok2 = studentSummary.rate === 50;
  console.log(`2. Taux de présence calculé : ${studentSummary.rate}% ${ok2 ? '✅' : '❌'}`);
  const ok3 =
    studentSummary.recentAbsences.length === 1 &&
    studentSummary.recentAbsences[0]?.justification?.status === 'PENDING';
  console.log(
    `3. recentAbsences[0] justification status = PENDING : ${ok3 ? '✅' : '❌'} (got ${studentSummary.recentAbsences[0]?.justification?.status})`,
  );

  // 3. Vue famille pour Hassan
  const familyOverview = await withT(tenant.id, async (tx) => {
    const out: Array<{
      childId: string;
      childName: string;
      className: string | null;
      attendanceRate: number | null;
      absences: number;
      due: number;
      paid: number;
      remaining: number;
    }> = [];
    for (const r of hassan.relationsAsParent) {
      const child = r.child;
      const sc = await tx.studentClass.findFirst({
        where: { studentId: child.id, unenrolledAt: null, class: { academicYearId: activeYear.id } },
        include: { class: { select: { name: true } } },
      });
      const att = await tx.attendanceRecord.findMany({
        where: {
          studentId: child.id,
          session: { date: { gte: activeYear.startDate, lte: activeYear.endDate } },
        },
        select: { status: true },
      });
      const present = att.filter((a) => a.status === 'PRESENT').length;
      const absences = att.filter((a) => a.status === 'ABSENT' || a.status === 'LATE').length;
      const installments = await tx.installment.findMany({
        where: { studentId: child.id, status: { not: 'CANCELLED' } },
        include: { payments: true },
      });
      const due = installments.reduce((s, i) => s + Number(i.amount), 0);
      const paid = installments.reduce(
        (s, i) => s + i.payments.reduce((ps, p) => ps + Number(p.amount), 0),
        0,
      );
      out.push({
        childId: child.id,
        childName: `${child.firstName} ${child.lastName}`,
        className: sc?.class.name ?? null,
        attendanceRate: att.length > 0 ? (present / att.length) * 100 : null,
        absences,
        due,
        paid,
        remaining: Math.max(0, due - paid),
      });
    }
    return out;
  });

  console.log(`\n👨‍👩‍👧 Vue famille Hassan :`);
  for (const c of familyOverview) {
    console.log(
      `   - ${c.childName} (${c.className ?? '∅'}) — présence ${c.attendanceRate?.toFixed(1) ?? '—'}% · ${c.absences} abs · reste ${c.remaining.toFixed(0)} MAD`,
    );
  }

  const yassineRow = familyOverview.find((c) => c.childId === yassine.id);
  const ok4 = familyOverview.length === hassan.relationsAsParent.length;
  console.log(`4. familyOverview retourne tous les enfants (${familyOverview.length}/${hassan.relationsAsParent.length}) ${ok4 ? '✅' : '❌'}`);
  const ok5 = yassineRow?.className === cls.class.name;
  console.log(`5. Classe agrégée pour Yassine = "${yassineRow?.className}" ${ok5 ? '✅' : '❌'}`);
  // Yassine a au moins l'absence qu'on vient de créer dans son compteur année active
  const ok6 = (yassineRow?.absences ?? 0) >= 1;
  console.log(`6. Yassine a ≥1 absence comptabilisée année active : ${yassineRow?.absences} ${ok6 ? '✅' : '❌'}`);

  // Cleanup
  await admin.attendanceSession.deleteMany({
    where: { classId: cls.classId, date: { in: [testDate1, testDate2] } },
  });
  if (needExtend) {
    await admin.academicYear.update({
      where: { id: activeYear.id },
      data: { endDate: originalEndDate },
    });
  }

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
