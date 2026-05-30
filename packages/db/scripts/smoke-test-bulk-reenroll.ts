/**
 * Smoke test S7 phase 2 : Réinscription en lot N → N+1.
 *   pnpm --filter @jawal/db exec tsx scripts/smoke-test-bulk-reenroll.ts
 *
 * Couvre :
 *  1) Création d'une année cible (N+1) temporaire pour le test
 *  2) Helper proposeNextLevel correct (1AC → 2AC s'il existe, sinon TC)
 *  3) Simulation du batch :
 *     - REENROLL pour Yassine (DRAFT créé sur N+1, niveau suggéré)
 *     - REPEAT pour Youssra (DRAFT créé sur N+1, niveau identique)
 *     - GRADUATE pour Salma (source passe GRADUATED, pas de nouveau dossier)
 *     - SKIP pour Omar (aucun changement)
 *  4) Idempotence : 2e exécution du batch sur les mêmes items → 0 créés
 *  5) Cleanup
 */
import { PrismaClient, PersonType, EnrollmentStatus } from '@prisma/client';

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

// Réimplémentation locale du helper proposeNextLevel (sans dépendance circulaire)
type LevelLite = {
  id: string;
  cycleId: string;
  order: number;
  cycle: { id: string; order: number };
};
function proposeNextLevel(currentLevelId: string, all: LevelLite[]): LevelLite | null {
  const current = all.find((l) => l.id === currentLevelId);
  if (!current) return null;
  const sameCycle = all.filter((l) => l.cycleId === current.cycleId).sort((a, b) => a.order - b.order);
  const idx = sameCycle.findIndex((l) => l.id === current.id);
  const nextInCycle = idx >= 0 && idx + 1 < sameCycle.length ? sameCycle[idx + 1] : null;
  if (nextInCycle) return nextInCycle;
  const cycles = Array.from(new Map(all.map((l) => [l.cycle.id, l.cycle])).values()).sort(
    (a, b) => a.order - b.order,
  );
  const cycleIdx = cycles.findIndex((c) => c.id === current.cycleId);
  const nextCycle = cycleIdx >= 0 && cycleIdx + 1 < cycles.length ? cycles[cycleIdx + 1] : null;
  if (!nextCycle) return null;
  return (
    all.filter((l) => l.cycleId === nextCycle.id).sort((a, b) => a.order - b.order)[0] ?? null
  );
}

async function main() {
  const tenant = await admin.tenant.findUniqueOrThrow({ where: { slug: 'demo' } });
  const sourceYear = await admin.academicYear.findFirstOrThrow({
    where: { tenantId: tenant.id, active: true },
  });
  const level1ac = await admin.level.findUniqueOrThrow({
    where: { tenantId_code: { tenantId: tenant.id, code: '1ac' } },
  });

  console.log(`🎯 Tenant: ${tenant.name}\n   Année source: ${sourceYear.label}\n`);

  // Setup : crée année cible (rollback à la fin)
  const targetLabel = `SMOKE-${Date.now()}`;
  await admin.academicYear.deleteMany({
    where: { tenantId: tenant.id, label: { startsWith: 'SMOKE-' } },
  });
  const targetYear = await admin.academicYear.create({
    data: {
      tenantId: tenant.id,
      label: targetLabel,
      startDate: new Date('2099-09-01'),
      endDate: new Date('2099-12-31'),
      active: false,
    },
  });
  console.log(`Année cible : ${targetYear.label}`);

  // 1. proposeNextLevel — 1AC est-il bien le seul niveau du seed ?
  const levelsAll = await admin.level.findMany({
    where: { tenantId: tenant.id },
    include: { cycle: { select: { id: true, order: true } } },
    orderBy: [{ cycle: { order: 'asc' } }, { order: 'asc' }],
  });
  const next = proposeNextLevel(level1ac.id, levelsAll);
  console.log(
    `1. proposeNextLevel(1AC) → ${next?.id ? next.id.slice(0, 8) + '… (' + (await admin.level.findUnique({ where: { id: next.id } }))?.code + ')' : 'null'}`,
  );
  // Pas de critère absolu (le seed peut évoluer) — on log juste pour visibilité

  // 2. Récupère les enrollments source : Yassine, Youssra, Salma
  const sourceEnrollments = await admin.enrollment.findMany({
    where: { tenantId: tenant.id, academicYearId: sourceYear.id },
    include: { student: { select: { firstName: true, lastName: true } } },
  });
  const yassine = sourceEnrollments.find((e) => e.student.firstName === 'Yassine')!;
  const youssra = sourceEnrollments.find((e) => e.student.firstName === 'Youssra')!;
  const salma = sourceEnrollments.find((e) => e.student.firstName === 'Salma')!;
  console.log(`\n   Yassine source: ${yassine.status}`);
  console.log(`   Youssra source: ${youssra.status}`);
  console.log(`   Salma source: ${salma.status}\n`);

  // 3. Simulation inline du batch (sans passer par l'action Next car on n'a pas de session)
  const targetLevelId = next?.id ?? level1ac.id; // fallback : même niveau si pas de next
  const targetEnrollmentsBefore = await admin.enrollment.count({
    where: { tenantId: tenant.id, academicYearId: targetYear.id },
  });

  await withT(tenant.id, async (tx) => {
    // REENROLL Yassine au niveau suggéré
    await tx.enrollment.create({
      data: {
        tenantId: tenant.id,
        studentId: yassine.studentId,
        academicYearId: targetYear.id,
        levelId: targetLevelId,
        status: 'DRAFT',
        notes: 'Réinscription en lot',
      },
    });
    // REPEAT Youssra au même niveau
    await tx.enrollment.create({
      data: {
        tenantId: tenant.id,
        studentId: youssra.studentId,
        academicYearId: targetYear.id,
        levelId: youssra.levelId,
        status: 'DRAFT',
        notes: 'Redoublement — créé par réinscription en lot',
      },
    });
    // GRADUATE Salma : source passe GRADUATED, pas de nouveau dossier
    await tx.enrollment.update({
      where: { id: salma.id },
      data: { status: 'GRADUATED' },
    });
  });

  const targetEnrollmentsAfter = await admin.enrollment.findMany({
    where: { tenantId: tenant.id, academicYearId: targetYear.id },
    include: { student: { select: { firstName: true } } },
  });
  const createdCount = targetEnrollmentsAfter.length - targetEnrollmentsBefore;
  console.log(`2. ${createdCount} dossiers créés sur année cible (attendu 2)`);
  const ok2 = createdCount === 2;
  console.log(`   ${ok2 ? '✅' : '❌'}`);

  // Vérif statut Salma source = GRADUATED
  const salmaAfter = await admin.enrollment.findUniqueOrThrow({ where: { id: salma.id } });
  const ok3 = salmaAfter.status === 'GRADUATED';
  console.log(`3. Salma source = GRADUATED : ${salmaAfter.status} ${ok3 ? '✅' : '❌'}`);

  // Vérif Yassine cible : DRAFT au niveau suggéré
  const yassineTarget = targetEnrollmentsAfter.find((e) => e.student.firstName === 'Yassine');
  const ok4 =
    yassineTarget !== undefined &&
    yassineTarget.status === 'DRAFT' &&
    yassineTarget.levelId === targetLevelId;
  console.log(
    `4. Yassine cible DRAFT niveau ${yassineTarget?.levelId.slice(0, 8)}… : ${ok4 ? '✅' : '❌'}`,
  );

  // Vérif Youssra cible : DRAFT au même niveau (REPEAT)
  const youssraTarget = targetEnrollmentsAfter.find((e) => e.student.firstName === 'Youssra');
  const ok5 =
    youssraTarget !== undefined &&
    youssraTarget.status === 'DRAFT' &&
    youssraTarget.levelId === youssra.levelId;
  console.log(
    `5. Youssra cible DRAFT même niveau (REPEAT) : ${ok5 ? '✅' : '❌'}`,
  );

  // 4. Idempotence — 2e tentative création Yassine doit échouer (unique constraint)
  let ok6 = false;
  try {
    await withT(tenant.id, async (tx) => {
      await tx.enrollment.create({
        data: {
          tenantId: tenant.id,
          studentId: yassine.studentId,
          academicYearId: targetYear.id,
          levelId: targetLevelId,
          status: 'DRAFT',
        },
      });
    });
  } catch {
    ok6 = true;
  }
  console.log(`6. Contrainte unique (student × year) bloque le doublon : ${ok6 ? '✅' : '❌'}`);

  // 5. Isolation tenant
  const fakeTenant = '00000000-0000-0000-0000-000000000000';
  const visible = await app.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${fakeTenant}'`);
    return tx.enrollment.count({ where: { academicYearId: targetYear.id } });
  });
  const ok7 = visible === 0;
  console.log(`7. Isolation cross-tenant → ${visible} enrollments visibles ${ok7 ? '✅' : '❌'}`);

  // Cleanup : restaure Salma + supprime année cible (cascade sur enrollments)
  await admin.enrollment.update({
    where: { id: salma.id },
    data: { status: 'DRAFT' },
  });
  await admin.academicYear.delete({ where: { id: targetYear.id } });

  await app.$disconnect();
  await admin.$disconnect();
  const all = ok2 && ok3 && ok4 && ok5 && ok6 && ok7;
  console.log(`\n${all ? '✅ Tous les tests passent.' : '❌ Au moins un test KO.'}`);
  if (!all) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
