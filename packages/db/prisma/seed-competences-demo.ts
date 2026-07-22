/**
 * Jeu de démonstration COHÉRENT pour une classe : devoirs notés + niveaux de
 * compétences dérivés de la même aptitude latente par élève.
 *
 * Objectif : que les deux volets se tiennent (un élève fort a de bonnes notes
 * ET de bons niveaux de compétences), avec une légère progression T1 → T3.
 *
 * Idempotent sur la classe cible : purge les évaluations de compétences du
 * tenant et les devoirs de la classe avant de régénérer.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TENANT = 'f83cceb3-8697-49a1-b3d3-47b5abca3574';
const CLASS_ID = '1bae84ff-9c09-4e57-aa4a-77ae253a5f32'; // 1AC-D

/** Hash déterministe → entier positif. */
function h(...parts: (string | number)[]): number {
  let x = 0;
  const s = parts.join('|');
  for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) >>> 0;
  return x;
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

async function main() {
  const year = await prisma.academicYear.findFirst({ where: { tenantId: TENANT, active: true } });
  if (!year) throw new Error('Aucune année active.');
  const periods = await prisma.period.findMany({
    where: { tenantId: TENANT, academicYearId: year.id },
    orderBy: { startDate: 'asc' },
  });
  const cls = await prisma.class.findUnique({ where: { id: CLASS_ID }, select: { levelId: true } });
  if (!cls) throw new Error('Classe introuvable.');

  const scs = await prisma.studentClass.findMany({
    where: { classId: CLASS_ID, unenrolledAt: null, student: { deletedAt: null } },
    select: { student: { select: { id: true, firstName: true, lastName: true } } },
  });
  const students = scs.map((s) => s.student);

  const curriculum = await prisma.curriculumSubject.findMany({
    where: { levelId: cls.levelId },
    select: { subjectId: true, subject: { select: { code: true } } },
  });
  const subjects = curriculum.map((c) => ({ id: c.subjectId, code: c.subject.code }));

  // Évaluateurs : profs affectés à la classe, sinon utilisateurs du tenant.
  const assigns = await prisma.teacherAssignment.findMany({
    where: { classId: CLASS_ID, academicYearId: year.id },
    select: { teacher: { select: { userPersons: { select: { userId: true } } } } },
  });
  let evaluatorIds = [
    ...new Set(assigns.flatMap((a) => a.teacher.userPersons.map((u) => u.userId))),
  ];
  if (evaluatorIds.length < 2) {
    const users = await prisma.user.findMany({ where: { tenantId: TENANT }, select: { id: true }, take: 3 });
    evaluatorIds = [...new Set([...evaluatorIds, ...users.map((u) => u.id)])];
  }
  const evA = evaluatorIds[0]!;
  const evB = evaluatorIds[1] ?? evaluatorIds[0]!;

  const scaleRows = await prisma.masteryLevel.findMany({ where: { tenantId: TENANT }, orderBy: { order: 'asc' } });
  const idForValue = new Map(scaleRows.map((m) => [m.value, m.id]));
  const maxVal = Math.max(...scaleRows.map((m) => m.value)); // 3

  // Feuilles évaluables + matière héritée.
  const nodes = await prisma.competencyNode.findMany({
    where: { tenantId: TENANT },
    select: { id: true, parentId: true, isLeaf: true, subjectId: true },
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const subjOf = (n: (typeof nodes)[number]): string | null => {
    let cur: (typeof nodes)[number] | undefined = n;
    while (cur) {
      if (cur.subjectId) return cur.subjectId;
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return null;
  };
  const leaves = nodes.filter((n) => n.isLeaf).map((n) => ({ id: n.id, subjectId: subjOf(n) }));

  // ── Purge ────────────────────────────────────────────────────────────────
  await prisma.competencyAssessment.deleteMany({ where: { tenantId: TENANT } });
  await prisma.evaluation.deleteMany({ where: { classId: CLASS_ID } }); // cascade grades

  // Aptitude latente par élève (0.30 → 0.85), affinité par matière.
  const theta = new Map(students.map((s) => [s.id, 0.3 + (h(s.id) % 56) / 100]));
  const affinity = (studentId: string, code: string) => ((h(studentId, code) % 7) - 3) * 0.4; // ±1.2

  // Progression trimestrielle : T1 plus bas, T3 plus haut.
  const periodBoost = (idx: number) => (idx - 1) * 0.05;

  // Moyenne matière par (élève, matière, période) — réutilisée pour les
  // compétences disciplinaires afin que niveaux et notes concordent.
  const subjAvg = new Map<string, number>(); // key: student|subject|period → /20

  let evalCount = 0;
  let gradeCount = 0;
  for (let pi = 0; pi < periods.length; pi++) {
    const period = periods[pi]!;
    const boost = periodBoost(pi);
    for (const subj of subjects) {
      for (let k = 0; k < 2; k++) {
        const ev = await prisma.evaluation.create({
          data: {
            tenantId: TENANT,
            classId: CLASS_ID,
            subjectId: subj.id,
            periodId: period.id,
            label: `Contrôle ${k + 1}`,
            date: new Date(period.startDate.getTime() + (20 + k * 25) * 86_400_000),
            maxValue: 20,
          },
        });
        evalCount++;
        for (const st of students) {
          const th = clamp(theta.get(st.id)! + boost, 0.05, 0.98);
          const noise = ((h(st.id, subj.code, period.id, k) % 9) - 4) * 0.3; // ±1.2
          let g = th * 13 + 5 + affinity(st.id, subj.code) + noise;
          g = clamp(Math.round(g * 4) / 4, 2, 19.5); // /20, pas de 0.25
          await prisma.grade.create({
            data: { tenantId: TENANT, evaluationId: ev.id, studentId: st.id, value: g, enteredByUserId: evA },
          });
          gradeCount++;
          const key = `${st.id}|${subj.id}|${period.id}`;
          subjAvg.set(key, (subjAvg.get(key) ?? 0) + g / 2); // moyenne des 2 contrôles
        }
      }
    }
  }

  // ── Compétences : dérivées des moyennes (disciplinaire) ou de θ (transversal)
  const assessments: {
    tenantId: string;
    studentId: string;
    nodeId: string;
    periodId: string;
    masteryLevelId: string;
    evaluatedByUserId: string;
    source: 'CLASS';
  }[] = [];

  for (let pi = 0; pi < periods.length; pi++) {
    const period = periods[pi]!;
    const boost = periodBoost(pi);
    for (const st of students) {
      const th = clamp(theta.get(st.id)! + boost, 0.05, 0.98);
      for (const leaf of leaves) {
        // Couverture partielle réaliste (~78 %).
        if (h(st.id, leaf.id) % 100 < 22) continue;

        // Base : moyenne de la matière si disciplinaire et notée, sinon θ.
        let base: number;
        const avg = leaf.subjectId ? subjAvg.get(`${st.id}|${leaf.subjectId}|${period.id}`) : undefined;
        if (avg !== undefined) base = (avg / 20) * maxVal;
        else base = th * maxVal;

        const noise = ((h(st.id, leaf.id, period.id) % 5) - 2) * 0.45; // ±0.9
        const level = clamp(Math.round(base + noise), 0, maxVal);
        assessments.push({
          tenantId: TENANT,
          studentId: st.id,
          nodeId: leaf.id,
          periodId: period.id,
          masteryLevelId: idForValue.get(level)!,
          evaluatedByUserId: evA,
          source: 'CLASS',
        });

        // ~30 % des items : 2e évaluateur (consolidation), niveau proche.
        if (h(st.id, leaf.id, period.id, 'b') % 100 < 30 && evB !== evA) {
          const level2 = clamp(level + ((h(st.id, leaf.id, 'b') % 3) - 1), 0, maxVal);
          assessments.push({
            tenantId: TENANT,
            studentId: st.id,
            nodeId: leaf.id,
            periodId: period.id,
            masteryLevelId: idForValue.get(level2)!,
            evaluatedByUserId: evB,
            source: 'CLASS',
          });
        }
      }
    }
  }
  // createMany par lots
  for (let i = 0; i < assessments.length; i += 500) {
    await prisma.competencyAssessment.createMany({ data: assessments.slice(i, i + 500), skipDuplicates: true });
  }

  console.log(`Classe 1AC-D — ${students.length} élèves`);
  console.log(`  Devoirs : ${evalCount} évaluations, ${gradeCount} notes`);
  console.log(`  Compétences : ${assessments.length} évaluations (2 enseignants)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
