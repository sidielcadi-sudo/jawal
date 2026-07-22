/**
 * Calcul des bilans de compétences (P3).
 *
 * Règles métier appliquées ici — elles étaient le principal angle mort de la
 * spécification initiale :
 *
 *  1. **Consolidation multi-enseignants** : plusieurs professeurs peuvent
 *     évaluer la même feuille ; la valeur retenue est la **moyenne arrondie**.
 *  2. **Items non évalués exclus** du dénominateur ; le taux de couverture est
 *     restitué à part pour ne pas faire passer un élève peu évalué pour un
 *     élève en difficulté.
 *  3. **Agrégation hiérarchique** : feuilles → compétence → domaine → global.
 *     Une compétence à 8 feuilles ne pèse donc pas 4× une compétence à 2.
 *  4. Une seule évaluation par (élève, feuille, période, enseignant) : les
 *     saisies successives d'un même professeur écrasent la précédente, donc la
 *     valeur reflète bien l'état d'acquisition **actuel**.
 */
import 'server-only';
import type { Prisma } from '@/lib/db';

type Tx = Prisma.TransactionClient;

export type CompetencyBreakdown = {
  id: string;
  label: string;
  rate: number | null;
  covered: number;
  total: number;
};

export type NodeKind = 'DISCIPLINARY' | 'TRANSVERSAL'; // alias : Compétence / Aptitude

export type CompetencyLine = CompetencyBreakdown & { kind: NodeKind };

export type DomainBreakdown = CompetencyBreakdown & {
  kind: NodeKind;
  competencies: CompetencyLine[];
};

export type StudentReport = {
  domains: DomainBreakdown[];
  disciplinaryRate: number | null;
  transversalRate: number | null;
  covered: number;
  total: number;
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/**
 * Calcule le bilan d'un ou plusieurs élèves pour une période.
 * Retourne une Map studentId → bilan. Une seule passe SQL pour toute la classe.
 */
export async function computeReports(
  tx: Tx,
  opts: { frameworkId: string; periodId: string; studentIds: string[]; levelId?: string | null },
): Promise<Map<string, StudentReport>> {
  const { frameworkId, periodId, studentIds, levelId } = opts;
  const out = new Map<string, StudentReport>();
  if (studentIds.length === 0) return out;

  const [nodes, scale, assessments] = await Promise.all([
    tx.competencyNode.findMany({
      where: { frameworkId },
      select: {
        id: true,
        parentId: true,
        kind: true,
        labelFr: true,
        isLeaf: true,
        depth: true,
        order: true,
        levels: { select: { levelId: true } },
      },
      orderBy: [{ depth: 'asc' }, { order: 'asc' }],
    }),
    tx.masteryLevel.findMany({ select: { id: true, value: true } }),
    tx.competencyAssessment.findMany({
      where: { periodId, studentId: { in: studentIds } },
      select: { studentId: true, nodeId: true, masteryLevelId: true },
    }),
  ]);

  const maxValue = Math.max(1, ...scale.map((s) => s.value));
  const valueById = new Map(scale.map((s) => [s.id, s.value]));

  // Arbre : domaines (depth 0) → compétences (depth 1) → feuilles actives.
  const byParent = new Map<string | null, typeof nodes>();
  for (const n of nodes) {
    const k = n.parentId ?? null;
    const arr = byParent.get(k) ?? [];
    arr.push(n);
    byParent.set(k, arr);
  }
  const activeLeaf = (n: (typeof nodes)[number]) =>
    n.isLeaf && (!levelId || n.levels.length === 0 || n.levels.some((l) => l.levelId === levelId));

  // Évaluations : (élève, feuille) → valeurs de chaque enseignant.
  const perStudentLeaf = new Map<string, number[]>();
  for (const a of assessments) {
    const v = valueById.get(a.masteryLevelId);
    if (v === undefined) continue;
    const k = `${a.studentId}|${a.nodeId}`;
    const arr = perStudentLeaf.get(k) ?? [];
    arr.push(v);
    perStudentLeaf.set(k, arr);
  }

  for (const studentId of studentIds) {
    const domains: DomainBreakdown[] = [];
    let coveredAll = 0;
    let totalAll = 0;

    for (const d of byParent.get(null) ?? []) {
      const competencies: CompetencyLine[] = [];
      for (const c of byParent.get(d.id) ?? []) {
        const leaves = (byParent.get(c.id) ?? []).filter(activeLeaf);
        const rates: number[] = [];
        for (const l of leaves) {
          const vals = perStudentLeaf.get(`${studentId}|${l.id}`);
          if (!vals || vals.length === 0) continue;
          // Consolidation : moyenne arrondie des saisies des enseignants.
          const consolidated = Math.round(mean(vals)!);
          rates.push((consolidated / maxValue) * 100);
        }
        competencies.push({
          id: c.id,
          label: c.labelFr,
          kind: c.kind as NodeKind, // Compétence (DISCIPLINARY) ou Aptitude (TRANSVERSAL)
          rate: mean(rates),
          covered: rates.length,
          total: leaves.length,
        });
        coveredAll += rates.length;
        totalAll += leaves.length;
      }
      const withData = competencies.filter((c) => c.rate !== null).map((c) => c.rate!);
      domains.push({
        id: d.id,
        label: d.labelFr,
        kind: d.kind as NodeKind,
        rate: mean(withData),
        covered: competencies.reduce((s, c) => s + c.covered, 0),
        total: competencies.reduce((s, c) => s + c.total, 0),
        competencies,
      });
    }

    // Taux global par TYPE (Compétence / Aptitude), pondéré par domaine : chaque
    // domaine contribue par la moyenne de ses lignes de ce type.
    const kindRate = (kind: NodeKind) =>
      mean(
        domains
          .map((d) => mean(d.competencies.filter((c) => c.kind === kind && c.rate !== null).map((c) => c.rate!)))
          .filter((r): r is number => r !== null),
      );

    out.set(studentId, {
      domains,
      disciplinaryRate: kindRate('DISCIPLINARY'),
      transversalRate: kindRate('TRANSVERSAL'),
      covered: coveredAll,
      total: totalAll,
    });
  }

  return out;
}

/** Couleur d'un taux (aligné sur l'échelle NA→M). */
export function rateColor(rate: number | null): string {
  if (rate === null) return '#cbd5e1';
  if (rate < 33) return '#ef4444';
  if (rate < 55) return '#f97316';
  if (rate < 80) return '#10b981';
  return '#059669';
}
