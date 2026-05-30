/**
 * Smoke test S7 : Inscriptions (Enrollment) + workflow DRAFT → ACTIVE → WITHDRAWN.
 *   pnpm --filter @jawal/db exec tsx scripts/smoke-test-enrollments.ts
 *
 * Couvre :
 *  - Seed initial : Yassine ACTIVE rang 1, Youssra ACTIVE rang 2 avec −10%, Salma DRAFT
 *  - Création nouveau DRAFT pour Omar
 *  - Validation Omar → ACTIVE : génère StudentClass + Installments, applique
 *    réduction fratrie si applicable
 *  - Retrait : annule installments PENDING/PARTIAL, désinscrit de la classe
 *  - Isolation cross-tenant
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
  const year = await admin.academicYear.findFirstOrThrow({
    where: { tenantId: tenant.id, active: true },
  });
  const level1ac = await admin.level.findUniqueOrThrow({
    where: { tenantId_code: { tenantId: tenant.id, code: '1ac' } },
  });
  const classe1ac = await admin.class.findFirstOrThrow({
    where: { tenantId: tenant.id, levelId: level1ac.id, academicYearId: year.id },
  });
  const settings = (tenant.settings ?? {}) as Record<string, unknown>;
  const tenantPct = (settings.siblingDiscountPct as number | undefined) ?? 10;

  console.log(`🎯 Tenant: ${tenant.name} · siblingDiscountPct = ${tenantPct}%\n`);

  // 1. Yassine + Youssra ACTIVE depuis le seed (fratrie)
  const yassine = await admin.person.findFirstOrThrow({
    where: { tenantId: tenant.id, firstName: 'Yassine', lastName: 'Benani' },
    include: { enrollments: true },
  });
  const youssra = await admin.person.findFirstOrThrow({
    where: { tenantId: tenant.id, firstName: 'Youssra', lastName: 'Benani' },
    include: { enrollments: true },
  });
  const ok1 =
    yassine.enrollments.some((e) => e.status === 'ACTIVE' && e.siblingRank === 1) &&
    youssra.enrollments.some(
      (e) => e.status === 'ACTIVE' && e.siblingRank === 2 && Number(e.discountPct) === 10,
    );
  console.log(
    `1. Yassine rang 1 (plein tarif) + Youssra rang 2 (−10%) : ${ok1 ? '✅' : '❌'}`,
  );

  // 2. Salma a un DRAFT
  const salma = await admin.person.findFirstOrThrow({
    where: { tenantId: tenant.id, firstName: 'Salma' },
    include: { enrollments: true },
  });
  const salmaDraft = salma.enrollments.find((e) => e.status === 'DRAFT');
  const ok2 = !!salmaDraft;
  console.log(`2. Salma a un dossier DRAFT : ${ok2 ? '✅' : '❌'}`);

  // 3. Workflow complet sur Omar : create DRAFT → validate → withdraw
  const omar = await admin.person.findFirstOrThrow({
    where: { tenantId: tenant.id, firstName: 'Omar' },
  });

  // Cleanup éventuel d'un run précédent
  await admin.enrollment.deleteMany({ where: { studentId: omar.id } });
  await admin.installment.deleteMany({ where: { studentId: omar.id } });
  await admin.studentClass.updateMany({
    where: { studentId: omar.id, classId: classe1ac.id, unenrolledAt: { not: null } },
    data: { unenrolledAt: null },
  });

  // 3.a CREATE DRAFT
  const draft = await withT(tenant.id, (tx) =>
    tx.enrollment.create({
      data: {
        tenantId: tenant.id,
        studentId: omar.id,
        academicYearId: year.id,
        levelId: level1ac.id,
        status: 'DRAFT',
      },
    }),
  );
  console.log(`3.a Omar DRAFT créé : ${draft.id.slice(0, 8)}… ✅`);

  // 3.b VALIDATE — simulons la logique de validateEnrollmentAction inline
  //     Omar n'a pas de fratrie → rang 1, pas de réduction.
  const fees = await admin.feeScheduleItem.findMany({
    where: { academicYearId: year.id, levelId: level1ac.id },
  });
  if (fees.length === 0) throw new Error('Grille tarifaire manquante pour 1AC');

  await withT(tenant.id, async (tx) => {
    // Sibling rank (Omar n'est pas Benani, rang = 1)
    const rels = await tx.personRelation.findMany({
      where: { childId: omar.id },
      select: { parentId: true },
    });
    let activeSibs = 0;
    if (rels.length > 0) {
      const sibs = await tx.personRelation.findMany({
        where: { parentId: { in: rels.map((r) => r.parentId) }, childId: { not: omar.id } },
        distinct: ['childId'],
        select: { childId: true },
      });
      activeSibs = await tx.enrollment.count({
        where: {
          studentId: { in: sibs.map((s) => s.childId) },
          academicYearId: year.id,
          status: 'ACTIVE',
        },
      });
    }
    const rank = activeSibs + 1;
    const pct = rank >= 2 ? tenantPct : 0;

    await tx.studentClass.upsert({
      where: { studentId_classId: { studentId: omar.id, classId: classe1ac.id } },
      update: { unenrolledAt: null },
      create: { tenantId: tenant.id, studentId: omar.id, classId: classe1ac.id },
    });

    for (const fee of fees) {
      const discounted =
        Math.round(Number(fee.totalAmount) * (1 - pct / 100) * 100) / 100;
      const perInst = Math.round((discounted / fee.installmentCount) * 100) / 100;
      const yearStart = year.startDate;
      for (let i = 0; i < fee.installmentCount; i++) {
        const m = ((fee.firstDueMonth - 1) + i) % 12;
        const y = Math.floor(((fee.firstDueMonth - 1) + i) / 12);
        await tx.installment.create({
          data: {
            tenantId: tenant.id,
            studentId: omar.id,
            feeScheduleItemId: fee.id,
            label: `${fee.label} (${i + 1}/${fee.installmentCount})`,
            amount: perInst,
            dueDate: new Date(Date.UTC(yearStart.getUTCFullYear() + y, m, 5)),
            status: 'PENDING',
          },
        });
      }
    }

    await tx.enrollment.update({
      where: { id: draft.id },
      data: {
        status: 'ACTIVE',
        classId: classe1ac.id,
        siblingRank: rank,
        discountPct: pct > 0 ? pct : null,
        feesGenerated: true,
        validatedAt: new Date(),
      },
    });
  });

  const validated = await admin.enrollment.findUniqueOrThrow({
    where: { id: draft.id },
    include: { class: true },
  });
  const ok3 =
    validated.status === 'ACTIVE' &&
    validated.classId === classe1ac.id &&
    validated.siblingRank === 1 &&
    validated.discountPct === null &&
    validated.feesGenerated;
  console.log(
    `3.b VALIDATE Omar → ACTIVE rang 1, sans réduction, classId=${classe1ac.id.slice(0, 8)}… : ${ok3 ? '✅' : '❌'}`,
  );

  const omarInstallments = await admin.installment.findMany({
    where: { studentId: omar.id },
    orderBy: { dueDate: 'asc' },
  });
  const totalDue = omarInstallments.reduce((s, i) => s + Number(i.amount), 0);
  const ok4 = omarInstallments.length === 9 && Math.abs(totalDue - 2700) < 0.1;
  console.log(
    `3.b Installments générés : ${omarInstallments.length} × ${omarInstallments[0]?.amount} = ${totalDue.toFixed(2)} MAD ${ok4 ? '✅' : '❌'}`,
  );

  const omarSC = await admin.studentClass.findFirstOrThrow({
    where: { studentId: omar.id, classId: classe1ac.id },
  });
  const ok5 = omarSC.unenrolledAt === null;
  console.log(`3.b StudentClass Omar dans 1AC-A actif : ${ok5 ? '✅' : '❌'}`);

  // 3.c WITHDRAW
  await withT(tenant.id, async (tx) => {
    await tx.installment.updateMany({
      where: { studentId: omar.id, status: { in: ['PENDING', 'PARTIAL'] } },
      data: { status: 'CANCELLED' },
    });
    await tx.studentClass.updateMany({
      where: { studentId: omar.id, classId: classe1ac.id, unenrolledAt: null },
      data: { unenrolledAt: new Date() },
    });
    await tx.enrollment.update({
      where: { id: draft.id },
      data: {
        status: 'WITHDRAWN',
        withdrawnAt: new Date(),
        withdrawalReason: 'Smoke test',
      },
    });
  });

  const withdrawn = await admin.enrollment.findUniqueOrThrow({ where: { id: draft.id } });
  const cancelled = await admin.installment.count({
    where: { studentId: omar.id, status: 'CANCELLED' },
  });
  const omarSCAfter = await admin.studentClass.findFirstOrThrow({
    where: { studentId: omar.id, classId: classe1ac.id },
  });
  const ok6 =
    withdrawn.status === 'WITHDRAWN' && cancelled === 9 && omarSCAfter.unenrolledAt !== null;
  console.log(
    `3.c WITHDRAW Omar → status=${withdrawn.status}, ${cancelled} échéances CANCELLED, désinscrit : ${ok6 ? '✅' : '❌'}`,
  );

  // 4. Si on revalidait Omar à nouveau (cas réel: changement d'avis), le rang
  //    fratrie doit rester cohérent — vérifions juste le compteur Salma DRAFT
  //    n'est pas affecté par les ACTIVE Benani (parents différents).
  const salmaCount = await admin.enrollment.count({
    where: { studentId: salma.id, status: 'ACTIVE' },
  });
  const ok7 = salmaCount === 0;
  console.log(`4. Salma reste DRAFT (aucun ACTIVE) : ${ok7 ? '✅' : '❌'}`);

  // 5. Isolation tenant
  const fakeTenant = '00000000-0000-0000-0000-000000000000';
  const visible = await app.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${fakeTenant}'`);
    return tx.enrollment.count();
  });
  const ok8 = visible === 0;
  console.log(`5. Isolation cross-tenant → ${visible} enrollments visibles ${ok8 ? '✅' : '❌'}`);

  // Cleanup Omar
  await admin.enrollment.delete({ where: { id: draft.id } });
  await admin.installment.deleteMany({ where: { studentId: omar.id } });
  await admin.studentClass.updateMany({
    where: { studentId: omar.id, classId: classe1ac.id, unenrolledAt: { not: null } },
    data: { unenrolledAt: null },
  });

  await app.$disconnect();
  await admin.$disconnect();
  const all = ok1 && ok2 && ok3 && ok4 && ok5 && ok6 && ok7 && ok8;
  console.log(`\n${all ? '✅ Tous les tests passent.' : '❌ Au moins un test KO.'}`);
  if (!all) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
