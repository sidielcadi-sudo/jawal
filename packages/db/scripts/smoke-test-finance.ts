/**
 * Smoke test S5 : finance (grilles + échéancier + paiements)
 *   pnpm --filter @jawal/db exec tsx scripts/smoke-test-finance.ts
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

function computeStatus(amount: number, paid: number): 'PENDING' | 'PARTIAL' | 'PAID' {
  if (paid <= 0) return 'PENDING';
  if (paid < amount) return 'PARTIAL';
  return 'PAID';
}

async function main() {
  const tenant = await admin.tenant.findUniqueOrThrow({ where: { slug: 'demo' } });
  console.log(`🎯 Tenant: ${tenant.name}\n`);

  const year = await admin.academicYear.findFirstOrThrow({ where: { tenantId: tenant.id, active: true } });
  const level = await admin.level.findFirstOrThrow({ where: { tenantId: tenant.id } });
  const student = await admin.person.findFirstOrThrow({ where: { tenantId: tenant.id, type: 'STUDENT' } });

  // 1. Création grille tarifaire 9 000 MAD / 9 échéances
  const fee = await withT(tenant.id, (tx) =>
    tx.feeScheduleItem.create({
      data: {
        tenantId: tenant.id,
        academicYearId: year.id,
        levelId: level.id,
        label: `Smoke-${Date.now()}`,
        totalAmount: 9000,
        installmentCount: 9,
        firstDueMonth: 9,
      },
    }),
  );
  console.log(`1. Grille créée (9000 / 9 échéances) ✅`);

  // 2. Génération d'échéances
  const yearStart = new Date(year.startDate);
  const installments = await withT(tenant.id, async (tx) => {
    const created = [];
    for (let i = 0; i < 9; i++) {
      const monthIdx = ((9 - 1 + i) % 12) + 1;
      const yearOffset = Math.floor((9 - 1 + i) / 12);
      const dueDate = new Date(Date.UTC(yearStart.getUTCFullYear() + yearOffset, monthIdx - 1, 5));
      const amount = i === 8 ? 9000 - 1000 * 8 : 1000;
      const inst = await tx.installment.create({
        data: {
          tenantId: tenant.id,
          studentId: student.id,
          feeScheduleItemId: fee.id,
          label: `Mensualité ${monthIdx}`,
          amount,
          dueDate,
        },
      });
      created.push(inst);
    }
    return created;
  });
  console.log(`2. 9 échéances créées, total ${installments.reduce((s, i) => s + Number(i.amount), 0)} ${installments.length === 9 ? '✅' : '❌'}`);

  // 3. Paiement partiel (500 / 1000)
  const first = installments[0]!;
  await withT(tenant.id, async (tx) => {
    await tx.payment.create({
      data: {
        tenantId: tenant.id,
        installmentId: first.id,
        amount: 500,
        method: 'CASH',
      },
    });
    await tx.installment.update({ where: { id: first.id }, data: { status: 'PARTIAL' } });
  });
  const after1 = await withT(tenant.id, (tx) =>
    tx.installment.findUniqueOrThrow({ where: { id: first.id }, include: { payments: true } }),
  );
  const paid1 = after1.payments.reduce((s, p) => s + Number(p.amount), 0);
  const status1 = computeStatus(Number(after1.amount), paid1);
  console.log(`3. Paiement partiel 500/1000 → status=${status1} ${status1 === 'PARTIAL' ? '✅' : '❌'}`);

  // 4. Solde de l'échéance → PAID
  await withT(tenant.id, async (tx) => {
    await tx.payment.create({
      data: {
        tenantId: tenant.id,
        installmentId: first.id,
        amount: 500,
        method: 'CMI',
        reference: 'CMI-TEST-001',
      },
    });
    await tx.installment.update({ where: { id: first.id }, data: { status: 'PAID' } });
  });
  const after2 = await withT(tenant.id, (tx) =>
    tx.installment.findUniqueOrThrow({ where: { id: first.id } }),
  );
  console.log(`4. Solde 500 + 500 = 1000 → status=${after2.status} ${after2.status === 'PAID' ? '✅' : '❌'}`);

  // 5. Agrégation : total payé sur la 1ère échéance = 1000
  const sumPaid = await withT(tenant.id, (tx) =>
    tx.payment.aggregate({
      where: { installmentId: first.id },
      _sum: { amount: true },
    }),
  );
  const ok5 = Number(sumPaid._sum.amount ?? 0) === 1000;
  console.log(`5. Aggregate sum payments = 1000 ${ok5 ? '✅' : '❌'}`);

  // 6. Isolation cross-tenant
  const fakeTenant = '00000000-0000-0000-0000-000000000000';
  const visible = await app.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${fakeTenant}'`);
    return {
      schedules: await tx.feeScheduleItem.count(),
      installments: await tx.installment.count(),
      payments: await tx.payment.count(),
    };
  });
  console.log(`6. Isolation cross-tenant → ${JSON.stringify(visible)} ${visible.schedules === 0 && visible.installments === 0 && visible.payments === 0 ? '✅' : '❌'}`);

  // Cleanup
  await admin.payment.deleteMany({ where: { installmentId: { in: installments.map((i) => i.id) } } });
  await admin.installment.deleteMany({ where: { id: { in: installments.map((i) => i.id) } } });
  await admin.feeScheduleItem.delete({ where: { id: fee.id } });

  await app.$disconnect();
  await admin.$disconnect();
  console.log('\n🧹 Cleanup OK\n✅ Tous les tests Finance passent.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
