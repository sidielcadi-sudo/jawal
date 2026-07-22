/**
 * Socle du module « Compétences & aptitudes » (APC).
 *
 * L'arbre est unique : les aptitudes transversales sont des nœuds
 * `kind = TRANSVERSAL` sans matière. Seules les feuilles (`isLeaf`) sont
 * évaluables.
 *
 * Règles métier centralisées ici :
 *  - **Qui peut évaluer** : une feuille rattachée à une matière n'est saisissable
 *    que par un enseignant de cette matière ; sans matière → tous les enseignants.
 *  - **Activation par niveau** : aucune ligne `CompetencyNodeLevel` sur la feuille
 *    = applicable à tous les niveaux ; sinon restreinte aux niveaux listés.
 *  - **Consolidation multi-enseignants** : plusieurs professeurs peuvent évaluer
 *    la même feuille ; la synthèse est la **moyenne arrondie** des valeurs.
 */
import 'server-only';
import type { Prisma } from '@/lib/db';

type Tx = Prisma.TransactionClient;

export type MasteryOption = {
  id: string;
  code: string;
  label: string;
  value: number;
  color: string;
};

export type LeafNode = {
  id: string;
  label: string;
  descriptor: string | null;
  kind: 'DISCIPLINARY' | 'TRANSVERSAL';
  subjectId: string | null;
  domain: string;
  competency: string;
};

/** Référentiel actif de l'année en cours (null si non initialisé). */
export async function loadActiveFramework(tx: Tx) {
  const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });
  if (!year) return null;
  return tx.competencyFramework.findFirst({
    where: { academicYearId: year.id, status: 'ACTIVE' },
    orderBy: { version: 'desc' },
    select: { id: true, label: true, academicYearId: true },
  });
}

/** Échelle de maîtrise ordonnée (NA → M). */
export async function loadMasteryScale(tx: Tx): Promise<MasteryOption[]> {
  const rows = await tx.masteryLevel.findMany({ orderBy: { order: 'asc' } });
  return rows.map((m) => ({ id: m.id, code: m.code, label: m.labelFr, value: m.value, color: m.color }));
}

/**
 * Feuilles évaluables du référentiel, avec le chemin (domaine › compétence).
 * `levelId` restreint aux feuilles actives pour ce niveau scolaire.
 */
export async function loadLeaves(
  tx: Tx,
  frameworkId: string,
  opts: { levelId?: string | null } = {},
): Promise<LeafNode[]> {
  const nodes = await tx.competencyNode.findMany({
    where: { frameworkId },
    select: {
      id: true,
      parentId: true,
      kind: true,
      labelFr: true,
      descriptor: true,
      subjectId: true,
      isLeaf: true,
      depth: true,
      order: true,
      levels: { select: { levelId: true } },
    },
    orderBy: [{ depth: 'asc' }, { order: 'asc' }],
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const out: LeafNode[] = [];
  for (const n of nodes) {
    if (!n.isLeaf) continue;
    // Activation par niveau : aucune ligne = tous les niveaux.
    if (opts.levelId && n.levels.length > 0 && !n.levels.some((l) => l.levelId === opts.levelId)) continue;

    const competency = n.parentId ? byId.get(n.parentId) : undefined;
    const domain = competency?.parentId ? byId.get(competency.parentId) : undefined;
    // La matière est héritée du plus proche ancêtre qui en porte une.
    const subjectId = n.subjectId ?? competency?.subjectId ?? domain?.subjectId ?? null;
    out.push({
      id: n.id,
      label: n.labelFr,
      descriptor: n.descriptor,
      kind: n.kind as LeafNode['kind'],
      subjectId,
      domain: domain?.labelFr ?? '—',
      competency: competency?.labelFr ?? '—',
    });
  }
  return out;
}

/**
 * Filtre les feuilles qu'un enseignant peut évaluer : celles de ses matières
 * dans la classe, plus toutes celles sans matière (transversales et items dont
 * la matière n'existe pas encore, ex. Amazigh).
 */
export function evaluableBy(leaves: LeafNode[], teacherSubjectIds: string[]): LeafNode[] {
  const mine = new Set(teacherSubjectIds);
  return leaves.filter((l) => l.subjectId === null || mine.has(l.subjectId));
}

/**
 * Synthèse d'un ensemble d'évaluations : moyenne arrondie des valeurs.
 * Retourne null si aucune évaluation.
 */
export function consolidate(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

/**
 * Taux d'acquisition (0–100) d'un ensemble d'items consolidés.
 * Basé sur la valeur numérique rapportée au maximum de l'échelle : les items
 * non évalués sont **exclus** du dénominateur (le taux de couverture est
 * restitué à part).
 */
export function masteryRate(consolidated: (number | null)[], maxValue: number) {
  const rated = consolidated.filter((v): v is number => v !== null);
  if (rated.length === 0 || maxValue <= 0) return { rate: null, covered: 0, total: consolidated.length };
  const rate = (rated.reduce((s, v) => s + v, 0) / (maxValue * rated.length)) * 100;
  return { rate, covered: rated.length, total: consolidated.length };
}
