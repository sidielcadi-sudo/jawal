/**
 * Smoke test : contrats salariés + affectations enseignants + détection alertes.
 *   pnpm --filter @jawal/db exec tsx scripts/smoke-test-contracts.ts
 */
import { PrismaClient, PersonType, ContractType } from '@prisma/client';

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

type Status = 'NO_CONTRACT' | 'NOT_STARTED' | 'ACTIVE' | 'EXPIRES_30' | 'EXPIRES_7' | 'EXPIRED';

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / (24 * 60 * 60 * 1000));
}

function status(p: { hireDate: Date | null; contractEndDate: Date | null }, now = new Date()): Status {
  if (!p.hireDate) return 'NO_CONTRACT';
  const today = startOfDay(now);
  if (startOfDay(p.hireDate).getTime() > today.getTime()) return 'NOT_STARTED';
  if (!p.contractEndDate) return 'ACTIVE';
  const days = daysBetween(today, p.contractEndDate);
  if (days < 0) return 'EXPIRED';
  if (days <= 7) return 'EXPIRES_7';
  if (days <= 30) return 'EXPIRES_30';
  return 'ACTIVE';
}

async function main() {
  const tenant = await admin.tenant.findUniqueOrThrow({ where: { slug: 'demo' } });
  console.log(`🎯 Tenant: ${tenant.name}\n`);

  // 1. Amina : CDI + hireDate → ACTIVE
  const amina = await withT(tenant.id, (tx) =>
    tx.person.findFirstOrThrow({
      where: { type: PersonType.TEACHER, firstName: 'Amina' },
    }),
  );
  const aminaStatus = status(amina);
  const ok1 = amina.contractType === ContractType.CDI && aminaStatus === 'ACTIVE';
  console.log(`1. Amina : ${amina.contractType} / hire=${amina.hireDate?.toISOString().slice(0,10)} → ${aminaStatus} ${ok1 ? '✅' : '❌'}`);

  // 2. Karim : CDD avec fin dans ~25 jours → EXPIRES_30
  const karim = await withT(tenant.id, (tx) =>
    tx.person.findFirstOrThrow({
      where: { type: PersonType.TEACHER, firstName: 'Karim' },
    }),
  );
  const karimStatus = status(karim);
  const karimDays = karim.contractEndDate ? daysBetween(new Date(), karim.contractEndDate) : null;
  const ok2 = karim.contractType === ContractType.CDD && (karimStatus === 'EXPIRES_30' || karimStatus === 'EXPIRES_7');
  console.log(`2. Karim : ${karim.contractType} / end dans ${karimDays}j → ${karimStatus} ${ok2 ? '✅' : '❌'}`);

  // 3. Test transition de statut
  const cases: Array<[Date | null, string]> = [
    [new Date(Date.now() - 5 * 86400e3), 'EXPIRED'],
    [new Date(Date.now() + 3 * 86400e3), 'EXPIRES_7'],
    [new Date(Date.now() + 15 * 86400e3), 'EXPIRES_30'],
    [new Date(Date.now() + 90 * 86400e3), 'ACTIVE'],
    [null, 'ACTIVE'],
  ];
  let ok3 = true;
  for (const [end, expected] of cases) {
    const got = status({ hireDate: new Date('2024-01-01'), contractEndDate: end });
    if (got !== expected) {
      console.log(`   transition KO end=${end?.toISOString().slice(0,10) ?? 'null'} attendu=${expected} obtenu=${got}`);
      ok3 = false;
    }
  }
  console.log(`3. Transitions de statut (5 cas) ${ok3 ? '✅' : '❌'}`);

  // 4. Affectation d'Amina : maths / classe / année active
  const assignments = await withT(tenant.id, (tx) =>
    tx.teacherAssignment.findMany({
      where: { teacherId: amina.id },
      include: { subject: true, class: true, academicYear: true },
    }),
  );
  const ok4 = assignments.length >= 1 && assignments[0]!.subject.code === 'math';
  console.log(`4. Affectation Amina : ${assignments.length} → ${assignments[0]?.subject.label ?? '∅'} en ${assignments[0]?.class.name ?? '∅'} ${ok4 ? '✅' : '❌'}`);

  // 5. Liste des alertes (helper côté DB direct)
  const allEmployees = await withT(tenant.id, (tx) =>
    tx.person.findMany({
      where: { type: { in: [PersonType.TEACHER, PersonType.STAFF] }, deletedAt: null, contractEndDate: { not: null } },
    }),
  );
  const alerts = allEmployees.filter((p) => {
    const s = status(p);
    return s === 'EXPIRES_30' || s === 'EXPIRES_7' || s === 'EXPIRED';
  });
  console.log(`5. Alertes contrats détectées : ${alerts.length} ${alerts.length >= 1 ? '✅' : '❌'}`);

  // 6. Isolation cross-tenant
  const fakeTenant = '00000000-0000-0000-0000-000000000000';
  const visible = await app.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${fakeTenant}'`);
    return {
      assignments: await tx.teacherAssignment.count(),
    };
  });
  const ok6 = visible.assignments === 0;
  console.log(`6. Isolation cross-tenant → ${JSON.stringify(visible)} ${ok6 ? '✅' : '❌'}`);

  await app.$disconnect();
  await admin.$disconnect();

  const all = ok1 && ok2 && ok3 && ok4 && alerts.length >= 1 && ok6;
  console.log(`\n${all ? '✅ Tous les tests passent.' : '❌ Au moins un test KO.'}`);
  if (!all) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
