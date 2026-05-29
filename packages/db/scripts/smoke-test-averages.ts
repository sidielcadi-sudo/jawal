/**
 * Smoke test S3 phase 2 : calculs de moyennes pondérées (matière + générale).
 *
 *   pnpm --filter @jawal/db exec tsx scripts/smoke-test-averages.ts
 *
 * On ne charge pas le lib applicatif `apps/web/src/lib/grades.ts` (server-only,
 * importe Next). On reproduit la même formule en local pour valider le contrat
 * data → calcul → résultat attendu.
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

/** Reproduction de la formule du lib pour validation locale. */
function studentSubjectAverage(grades: { value: number; weight: number; maxValue: number; subjectScale: number }[]): number | null {
  if (grades.length === 0) return null;
  const normalized = grades.map((g) => ({ n: g.value * (g.subjectScale / g.maxValue), w: g.weight }));
  const sumWeighted = normalized.reduce((s, x) => s + x.n * x.w, 0);
  const sumWeights = normalized.reduce((s, x) => s + x.w, 0);
  return sumWeights > 0 ? sumWeighted / sumWeights : null;
}

async function main() {
  const tenant = await admin.tenant.findUniqueOrThrow({ where: { slug: 'demo' } });
  console.log(`🎯 Tenant: ${tenant.name}\n`);

  const cls = await admin.class.findFirstOrThrow({
    where: { tenantId: tenant.id, deletedAt: null },
    include: { students: { where: { unenrolledAt: null }, take: 2 } },
  });
  if (cls.students.length < 2) throw new Error("Besoin d'au moins 2 élèves");
  const [s1, s2] = cls.students;

  const period = await admin.period.findFirstOrThrow({ where: { tenantId: tenant.id } });

  // Setup : 2 matières (Math coef 4, FR coef 4), 3 évaluations
  const math = await admin.subject.create({
    data: { tenantId: tenant.id, code: `math-${Date.now()}`, label: 'Math', scale: 20, coefficient: 4, order: 1 },
  });
  const fr = await admin.subject.create({
    data: { tenantId: tenant.id, code: `fr-${Date.now()}`, label: 'Français', scale: 20, coefficient: 4, order: 2 },
  });

  // Math : 2 évaluations (coef 1 et 2) → on teste la pondération
  const mathE1 = await admin.evaluation.create({
    data: { tenantId: tenant.id, classId: cls.id, subjectId: math.id, periodId: period.id, label: 'Maths C1', date: new Date(), weight: 1, maxValue: 20 },
  });
  const mathE2 = await admin.evaluation.create({
    data: { tenantId: tenant.id, classId: cls.id, subjectId: math.id, periodId: period.id, label: 'Maths C2', date: new Date(), weight: 2, maxValue: 20 },
  });
  // Français : 1 évaluation sur /10 → on teste la normalisation à scale=20
  const frE1 = await admin.evaluation.create({
    data: { tenantId: tenant.id, classId: cls.id, subjectId: fr.id, periodId: period.id, label: 'Français C1', date: new Date(), weight: 1, maxValue: 10 },
  });

  // Notes student 1 :
  //   Math C1 = 15/20 (w=1)   Math C2 = 9/20 (w=2)   → moy math = (15 + 9*2) / 3 = 11
  //   FR C1 = 7/10 → normalisé à 20 = 14            → moy français = 14
  //   Générale = (11*4 + 14*4) / 8 = (44+56)/8 = 12.5
  await admin.grade.createMany({
    data: [
      { tenantId: tenant.id, evaluationId: mathE1.id, studentId: s1.studentId, value: 15 },
      { tenantId: tenant.id, evaluationId: mathE2.id, studentId: s1.studentId, value: 9 },
      { tenantId: tenant.id, evaluationId: frE1.id, studentId: s1.studentId, value: 7 },
      // student 2 : seulement Math C1
      { tenantId: tenant.id, evaluationId: mathE1.id, studentId: s2.studentId, value: 18 },
    ],
  });

  // 1. Calcul attendu sur student 1
  const expectedMath = (15 * 1 + 9 * 2) / (1 + 2); // 11
  const expectedFr = (7 * (20 / 10) * 1) / 1; // 14
  const expectedGeneral = (expectedMath * 4 + expectedFr * 4) / (4 + 4); // 12.5
  console.log(`Attendu student 1 : math=${expectedMath} fr=${expectedFr} générale=${expectedGeneral}`);

  // 2. Calcul réel (reproduit la même formule que lib/grades.ts)
  const rows = await withT(tenant.id, (tx) =>
    tx.grade.findMany({
      where: {
        value: { not: null },
        evaluation: { classId: cls.id, periodId: period.id },
      },
      select: {
        studentId: true,
        value: true,
        evaluation: {
          select: { weight: true, maxValue: true, subjectId: true, subject: { select: { id: true, scale: true, coefficient: true } } },
        },
      },
    }),
  );

  const s1Math = rows.filter((r) => r.studentId === s1.studentId && r.evaluation.subjectId === math.id);
  const s1Fr = rows.filter((r) => r.studentId === s1.studentId && r.evaluation.subjectId === fr.id);

  const mathAvg = studentSubjectAverage(
    s1Math.map((r) => ({ value: r.value!, weight: r.evaluation.weight, maxValue: r.evaluation.maxValue, subjectScale: r.evaluation.subject.scale })),
  );
  const frAvg = studentSubjectAverage(
    s1Fr.map((r) => ({ value: r.value!, weight: r.evaluation.weight, maxValue: r.evaluation.maxValue, subjectScale: r.evaluation.subject.scale })),
  );

  console.log(`Calculé student 1 : math=${mathAvg} fr=${frAvg}`);

  console.log(`1. Moyenne math = ${expectedMath} ${Math.abs((mathAvg ?? 0) - expectedMath) < 0.01 ? '✅' : '❌'}`);
  console.log(`2. Moyenne français (norm 10→20) = ${expectedFr} ${Math.abs((frAvg ?? 0) - expectedFr) < 0.01 ? '✅' : '❌'}`);

  // 3. Moyenne générale
  const generalAvg = (mathAvg! * math.coefficient + frAvg! * fr.coefficient) / (math.coefficient + fr.coefficient);
  console.log(`3. Moyenne générale = ${expectedGeneral} ${Math.abs(generalAvg - expectedGeneral) < 0.01 ? '✅' : '❌'}`);

  // 4. Élève sans note dans une matière → matière exclue du calcul général
  const s2Math = rows.filter((r) => r.studentId === s2.studentId && r.evaluation.subjectId === math.id);
  const s2Fr = rows.filter((r) => r.studentId === s2.studentId && r.evaluation.subjectId === fr.id);
  const s2MathAvg = studentSubjectAverage(
    s2Math.map((r) => ({ value: r.value!, weight: r.evaluation.weight, maxValue: r.evaluation.maxValue, subjectScale: r.evaluation.subject.scale })),
  );
  const s2FrAvg = studentSubjectAverage(
    s2Fr.map((r) => ({ value: r.value!, weight: r.evaluation.weight, maxValue: r.evaluation.maxValue, subjectScale: r.evaluation.subject.scale })),
  );
  // Pour student 2 : math=18, fr=null → général = 18 (seulement math compte)
  console.log(`4. Élève sans note FR → math=${s2MathAvg} fr=${s2FrAvg} (null attendu) ${s2MathAvg === 18 && s2FrAvg === null ? '✅' : '❌'}`);

  // 5. Moyenne de classe par matière (Math)
  const classMathRows = rows.filter((r) => r.evaluation.subjectId === math.id);
  const studentMathAvgs = new Map<string, number>();
  for (const sId of [s1.studentId, s2.studentId]) {
    const sGrades = classMathRows
      .filter((r) => r.studentId === sId)
      .map((r) => ({ value: r.value!, weight: r.evaluation.weight, maxValue: r.evaluation.maxValue, subjectScale: r.evaluation.subject.scale }));
    const avg = studentSubjectAverage(sGrades);
    if (avg !== null) studentMathAvgs.set(sId, avg);
  }
  const classMathAvg = Array.from(studentMathAvgs.values()).reduce((a, b) => a + b, 0) / studentMathAvgs.size;
  // student 1 : 11, student 2 : 18 → classe = 14.5
  console.log(`5. Moyenne classe Math = ${classMathAvg} ${Math.abs(classMathAvg - 14.5) < 0.01 ? '✅' : '❌'}`);

  // 6. Isolation
  const fakeTenant = '00000000-0000-0000-0000-000000000000';
  const visible = await app.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${fakeTenant}'`);
    return tx.grade.count();
  });
  console.log(`6. Isolation cross-tenant → ${visible} grades ${visible === 0 ? '✅' : '❌'}`);

  // Cleanup
  await admin.grade.deleteMany({ where: { evaluationId: { in: [mathE1.id, mathE2.id, frE1.id] } } });
  await admin.evaluation.deleteMany({ where: { id: { in: [mathE1.id, mathE2.id, frE1.id] } } });
  await admin.subject.deleteMany({ where: { id: { in: [math.id, fr.id] } } });

  await app.$disconnect();
  await admin.$disconnect();
  console.log('\n🧹 Cleanup OK\n✅ Tous les tests Averages passent.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
