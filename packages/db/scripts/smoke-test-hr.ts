/**
 * Smoke test : RH (spécialités, cycles, diplômes, financier, ancienneté).
 *   pnpm --filter @jawal/db exec tsx scripts/smoke-test-hr.ts
 */
import { PrismaClient, PersonType, PayrollPaymentMethod } from '@prisma/client';

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

  const amina = await withT(tenant.id, (tx) =>
    tx.person.findFirstOrThrow({
      where: { type: PersonType.TEACHER, firstName: 'Amina' },
      include: {
        teacherSpecialties: { include: { subject: true } },
        teacherCycles: { include: { cycle: true } },
        diplomas: { orderBy: { order: 'asc' } },
      },
    }),
  );

  // 1. Spécialités (Maths + Physique)
  const ok1 = amina.teacherSpecialties.length >= 2 &&
    amina.teacherSpecialties.some((s) => s.subject.label === 'Mathématiques');
  console.log(`1. Spécialités : ${amina.teacherSpecialties.map((s) => s.subject.label).join(', ')} ${ok1 ? '✅' : '❌'}`);

  // 2. Cycles (Collège au moins)
  const ok2 = amina.teacherCycles.length >= 1;
  console.log(`2. Cycles enseignés : ${amina.teacherCycles.map((c) => c.cycle.label).join(', ')} ${ok2 ? '✅' : '❌'}`);

  // 3. Diplômes seeded
  const ok3 = amina.diplomas.length === 2;
  console.log(`3. Diplômes : ${amina.diplomas.length} → ${amina.diplomas[0]?.title ?? '∅'} ${ok3 ? '✅' : '❌'}`);

  // 4. Données financières seedées
  const ok4 =
    amina.payrollMethod === PayrollPaymentMethod.BANK_TRANSFER &&
    Number(amina.grossSalary) === 12000 &&
    Number(amina.netSalary) === 9800;
  console.log(`4. Financier : ${amina.bankName} · ${amina.payrollMethod} · brut=${amina.grossSalary} net=${amina.netSalary} ${ok4 ? '✅' : '❌'}`);

  // 5. Ancienneté calculée
  const sen = amina.hireDate
    ? Math.floor((Date.now() - amina.hireDate.getTime()) / (365.25 * 86400e3))
    : null;
  const ok5 = sen !== null && sen >= 1;
  console.log(`5. Ancienneté : ${sen} ans (depuis ${amina.hireDate?.toISOString().slice(0, 10)}) ${ok5 ? '✅' : '❌'}`);

  // 6. Avantages = 2 items
  const benefits = Array.isArray(amina.benefits) ? amina.benefits : [];
  const ok6 = benefits.length === 2;
  console.log(`6. Avantages : ${benefits.length} ${ok6 ? '✅' : '❌'}`);

  // 7. Disponibilités (5 jours saisis)
  const av = (amina.availability ?? {}) as Record<string, Array<{ from: string; to: string }>>;
  const daysWithSlots = Object.entries(av).filter(([, s]) => s.length > 0).length;
  const ok7 = daysWithSlots === 5;
  console.log(`7. Disponibilités : ${daysWithSlots} jours avec créneaux ${ok7 ? '✅' : '❌'}`);

  // 8. Isolation cross-tenant
  const fakeTenant = '00000000-0000-0000-0000-000000000000';
  const visible = await app.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${fakeTenant}'`);
    return {
      specialties: await tx.teacherSpecialty.count(),
      cycles: await tx.teacherCycle.count(),
      diplomas: await tx.diploma.count(),
    };
  });
  const ok8 = visible.specialties === 0 && visible.cycles === 0 && visible.diplomas === 0;
  console.log(`8. Isolation → ${JSON.stringify(visible)} ${ok8 ? '✅' : '❌'}`);

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
