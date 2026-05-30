/**
 * Smoke test S6 phase 2 : Pointage personnel (StaffAttendance) + retenues.
 *   pnpm --filter @jawal/db exec tsx scripts/smoke-test-staff-attendance.ts
 */
import { PrismaClient, PersonType, StaffAttendanceStatus } from '@prisma/client';

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

// Réimplémenté ici pour rester self-contained (sans dépendance circulaire vers apps/web)
const DAYS_PER_MONTH = 26;
const HOURS_PER_DAY = 8;
const LATE_TOLERANCE = 15;

function computeDeduction(
  status: StaffAttendanceStatus,
  gross: number,
  lateMin: number | null,
): number {
  if (gross <= 0) return 0;
  if (status === 'PRESENT' || status === 'EXCUSED' || status === 'LEAVE') return 0;
  if (status === 'ABSENT') return Math.round((gross / DAYS_PER_MONTH) * 100) / 100;
  if (status === 'LATE') {
    const m = Math.max(0, lateMin ?? 0);
    if (m <= LATE_TOLERANCE) return 0;
    const hr = gross / DAYS_PER_MONTH / HOURS_PER_DAY;
    return Math.round(((hr * (m - LATE_TOLERANCE)) / 60) * 100) / 100;
  }
  return 0;
}

async function main() {
  const tenant = await admin.tenant.findUniqueOrThrow({ where: { slug: 'demo' } });
  console.log(`🎯 Tenant: ${tenant.name}\n`);

  // 1. Cohérence du calcul de retenue
  const cases: Array<[string, StaffAttendanceStatus, number, number | null, number]> = [
    ['PRESENT brut 12000', 'PRESENT', 12000, null, 0],
    ['ABSENT brut 12000', 'ABSENT', 12000, null, 461.54],
    ['LATE 25min brut 12000 → 10min facturables', 'LATE', 12000, 25, 9.62],
    ['LATE 10min brut 12000 ≤ tolérance', 'LATE', 12000, 10, 0],
    ['EXCUSED', 'EXCUSED', 12000, null, 0],
    ['LEAVE', 'LEAVE', 12000, null, 0],
    ['ABSENT sans salaire', 'ABSENT', 0, null, 0],
  ];
  let ok1 = true;
  cases.forEach(([label, status, gross, late, expected], idx) => {
    const got = computeDeduction(status, gross, late);
    const pass = Math.abs(got - expected) < 0.02;
    console.log(`1.${idx + 1} ${label} → attendu ${expected}, obtenu ${got} ${pass ? '✅' : '❌'}`);
    if (!pass) ok1 = false;
  });

  // 2. Amina a 5 jours seedés
  const amina = await withT(tenant.id, async (tx) =>
    tx.person.findFirstOrThrow({
      where: { type: PersonType.TEACHER, firstName: 'Amina' },
      include: { staffAttendance: { orderBy: { date: 'desc' } } },
    }),
  );
  const ok2 = amina.staffAttendance.length === 5;
  console.log(`2. Amina a 5 entrées de pointage : ${amina.staffAttendance.length} ${ok2 ? '✅' : '❌'}`);

  // 3. Décomposition : 3 PRESENT + 1 LATE + 1 ABSENT
  const byStatus = amina.staffAttendance.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  const ok3 = byStatus.PRESENT === 3 && byStatus.LATE === 1 && byStatus.ABSENT === 1;
  console.log(`3. Décomposition ${JSON.stringify(byStatus)} ${ok3 ? '✅' : '❌'}`);

  // 4. Total retenues > 0 et cohérent avec brut Amina
  const totalDeduction = amina.staffAttendance.reduce(
    (s, r) => s + Number(r.deductionAmount),
    0,
  );
  const ok4 = totalDeduction > 400 && totalDeduction < 500;
  console.log(`4. Total retenues mensuelles : ${totalDeduction.toFixed(2)} MAD ${ok4 ? '✅' : '❌'}`);

  // 5. Unicité (personId, date) — tentative de re-création doit échouer
  let ok5 = false;
  const existing = amina.staffAttendance[0];
  try {
    await withT(tenant.id, async (tx) => {
      await tx.staffAttendance.create({
        data: {
          tenantId: tenant.id,
          personId: amina.id,
          date: existing.date,
          status: 'PRESENT',
        },
      });
    });
  } catch {
    ok5 = true; // Erreur de contrainte unique attendue
  }
  console.log(`5. Contrainte unique (personId, date) : ${ok5 ? '✅' : '❌'}`);

  // 6. Isolation cross-tenant
  const fakeTenant = '00000000-0000-0000-0000-000000000000';
  const visible = await app.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${fakeTenant}'`);
    return tx.staffAttendance.count();
  });
  const ok6 = visible === 0;
  console.log(`6. Isolation cross-tenant → ${visible} entrées visibles ${ok6 ? '✅' : '❌'}`);

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
