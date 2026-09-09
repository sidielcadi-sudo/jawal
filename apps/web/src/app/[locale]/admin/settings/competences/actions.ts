'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { requireRoleCode } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

/** Rôles autorisés à administrer le référentiel de compétences. */
const ROLES = ['tenant_admin', 'direction'];

async function guard() {
  const session = await auth();
  if (!session?.user) return null;
  await requireRoleCode(ROLES);
  return session;
}

/** Rattache (ou détache) une feuille à une matière — pilote qui peut évaluer. */
export async function setNodeSubjectAction(nodeId: string, subjectId: string | null): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  try {
    await withTenant(s.user.tenantId, async (tx) => {
      await tx.competencyNode.update({ where: { id: nodeId }, data: { subjectId } });
      await logAudit(tx, {
        tenantId: s.user.tenantId,
        userId: s.user.id,
        action: 'update',
        entityType: 'CompetencyNode',
        entityId: nodeId,
        after: { subjectId },
      });
    });
    revalidatePath('/admin/settings/competences');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/**
 * Définit les niveaux scolaires sur lesquels une compétence est évaluable.
 * L'activation est écrite sur **les feuilles** de la compétence (la résolution
 * ne consulte que les feuilles). Liste vide = applicable à tous les niveaux.
 */
export async function setCompetencyLevelsAction(
  competencyId: string,
  levelIds: string[],
): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const tenantId = s.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const leaves = await tx.competencyNode.findMany({
        where: { parentId: competencyId, isLeaf: true },
        select: { id: true },
      });
      const ids = leaves.map((l) => l.id);
      if (ids.length === 0) return;
      await tx.competencyNodeLevel.deleteMany({ where: { nodeId: { in: ids } } });
      if (levelIds.length > 0) {
        await tx.competencyNodeLevel.createMany({
          data: ids.flatMap((nodeId) => levelIds.map((levelId) => ({ tenantId, nodeId, levelId }))),
          skipDuplicates: true,
        });
      }
      await logAudit(tx, {
        tenantId,
        userId: s.user.id,
        action: 'update',
        entityType: 'CompetencyNode',
        entityId: competencyId,
        after: { levels: levelIds.length === 0 ? 'all' : levelIds.length },
      });
    });
    revalidatePath('/admin/settings/competences');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/**
 * Reprend un référentiel d'une autre année pour l'année active.
 *
 * Copie l'arbre complet — domaines, compétences, aptitudes, descripteurs,
 * matière pilote et activation par niveau. Les nœuds sont recréés dans l'ordre
 * de profondeur pour que chaque parent existe avant ses enfants ; une table de
 * correspondance ancien→nouvel identifiant reconstruit les liens.
 *
 * Le référentiel source n'est pas modifié : les évaluations déjà saisies y
 * restent rattachées.
 */
export async function importFrameworkFromYearAction(
  sourceFrameworkId: string,
): Promise<Result<{ nodes: number; levels: number }>> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requireRoleCode(['tenant_admin', 'direction']);
  const tenantId = session.user.tenantId;

  try {
    const counts = await withTenant(tenantId, async (tx) => {
      const year = await tx.academicYear.findFirst({
        where: { active: true },
        select: { id: true, label: true },
      });
      if (!year) throw new Error('Aucune année scolaire active.');

      const existing = await tx.competencyFramework.findFirst({
        where: { academicYearId: year.id, status: 'ACTIVE' },
        select: { id: true },
      });
      if (existing) {
        throw new Error('Un référentiel actif existe déjà pour cette année.');
      }

      const source = await tx.competencyFramework.findUnique({
        where: { id: sourceFrameworkId },
        select: { id: true, label: true, academicYearId: true },
      });
      if (!source) throw new Error('Référentiel source introuvable.');
      if (source.academicYearId === year.id) {
        throw new Error('Le référentiel source appartient déjà à l’année active.');
      }

      // Version suivante sur l'année cible : l'unicité porte sur
      // (tenant, année, version), une reprise ne doit pas la violer.
      const last = await tx.competencyFramework.findFirst({
        where: { academicYearId: year.id },
        orderBy: { version: 'desc' },
        select: { version: true },
      });

      const created = await tx.competencyFramework.create({
        data: {
          tenantId,
          academicYearId: year.id,
          label: `Référentiel de compétences ${year.label}`,
          version: (last?.version ?? 0) + 1,
          status: 'ACTIVE',
        },
      });

      const nodes = await tx.competencyNode.findMany({
        where: { frameworkId: source.id },
        include: { levels: { select: { levelId: true } } },
        orderBy: [{ depth: 'asc' }, { order: 'asc' }],
      });

      const idMap = new Map<string, string>();
      let levelLinks = 0;
      for (const n of nodes) {
        const copy = await tx.competencyNode.create({
          data: {
            tenantId,
            frameworkId: created.id,
            // Le tri par profondeur garantit que le parent est déjà copié.
            parentId: n.parentId ? (idMap.get(n.parentId) ?? null) : null,
            kind: n.kind,
            labelFr: n.labelFr,
            labelAr: n.labelAr,
            descriptor: n.descriptor,
            subjectId: n.subjectId,
            depth: n.depth,
            order: n.order,
            isLeaf: n.isLeaf,
          },
        });
        idMap.set(n.id, copy.id);

        for (const l of n.levels) {
          await tx.competencyNodeLevel.create({
            data: { tenantId, nodeId: copy.id, levelId: l.levelId },
          });
          levelLinks += 1;
        }
      }

      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'create',
        entityType: 'CompetencyFramework',
        entityId: created.id,
        after: { copiedFrom: source.id, nodes: nodes.length, levels: levelLinks },
      });

      return { nodes: nodes.length, levels: levelLinks };
    });

    revalidatePath('/admin/settings/competences');
    revalidatePath('/admin/competences');
    return { ok: true, data: counts };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/* ────────────────────────────────────────────────────────────────────────
   Référentiel MODÈLE de l'établissement
   ──────────────────────────────────────────────────────────────────────── */

/**
 * Le modèle est le référentiel de travail : on l'édite librement toute
 * l'année, et on l'importe dans une année scolaire quand il est prêt. Les
 * référentiels d'année en sont des copies — les modifier après coup ne touche
 * pas aux évaluations déjà saisies, et inversement.
 *
 * Il n'y en a qu'un par établissement : `ensureTemplate` le crée à la volée,
 * éventuellement en reprenant un référentiel d'année existant pour ne pas
 * repartir d'une page blanche.
 */
export async function ensureTemplateAction(): Promise<Result<{ id: string; copied: number }>> {
  const session = await guard();
  if (!session) return { ok: false, error: 'Non authentifié' };
  const tenantId = session.user.tenantId;

  try {
    const out = await withTenant(tenantId, async (tx) => {
      const existing = await tx.competencyFramework.findFirst({
        where: { isTemplate: true },
        select: { id: true },
      });
      if (existing) return { id: existing.id, copied: 0 };

      const created = await tx.competencyFramework.create({
        data: {
          tenantId,
          academicYearId: null,
          isTemplate: true,
          label: 'Référentiel modèle',
          status: 'ACTIVE',
        },
      });

      // Amorçage : le référentiel d'année le plus récent sert de point de
      // départ. Sans ça, l'écran s'ouvrirait sur un arbre vide alors que
      // l'établissement a déjà tout saisi ailleurs.
      const source = await tx.competencyFramework.findFirst({
        where: { isTemplate: false },
        orderBy: { academicYear: { startDate: 'desc' } },
        select: { id: true },
      });
      let copied = 0;
      if (source) copied = await copyNodes(tx, tenantId, source.id, created.id);

      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'create',
        entityType: 'CompetencyFramework',
        entityId: created.id,
        after: { isTemplate: true, seededFrom: source?.id ?? null, copied },
      });
      return { id: created.id, copied };
    });

    revalidatePath('/admin/settings/competences');
    return { ok: true, data: out };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/** Ajoute un nœud au modèle : domaine (sans parent) ou enfant d'un nœud. */
export async function createTemplateNodeAction(input: {
  parentId: string | null;
  kind: 'DISCIPLINARY' | 'TRANSVERSAL';
  labelFr: string;
  labelAr?: string;
  descriptor?: string;
  subjectId?: string | null;
  isLeaf: boolean;
}): Promise<Result<{ id: string }>> {
  const session = await guard();
  if (!session) return { ok: false, error: 'Non authentifié' };
  const label = input.labelFr.trim();
  if (!label) return { ok: false, error: 'Le libellé est requis.' };
  const tenantId = session.user.tenantId;

  try {
    const id = await withTenant(tenantId, async (tx) => {
      const template = await tx.competencyFramework.findFirst({
        where: { isTemplate: true },
        select: { id: true },
      });
      if (!template) throw new Error('Aucun référentiel modèle. Créez-le d’abord.');

      let depth = 0;
      if (input.parentId) {
        const parent = await tx.competencyNode.findUnique({
          where: { id: input.parentId },
          select: { depth: true, frameworkId: true, isLeaf: true },
        });
        if (!parent || parent.frameworkId !== template.id) {
          throw new Error('Nœud parent introuvable dans le modèle.');
        }
        depth = parent.depth + 1;
        // Un parent ne peut plus être une feuille évaluable : les notes se
        // saisissent sur les feuilles, pas sur les branches.
        if (parent.isLeaf) {
          await tx.competencyNode.update({
            where: { id: input.parentId },
            data: { isLeaf: false },
          });
        }
      }

      const last = await tx.competencyNode.findFirst({
        where: { frameworkId: template.id, parentId: input.parentId },
        orderBy: { order: 'desc' },
        select: { order: true },
      });

      const node = await tx.competencyNode.create({
        data: {
          tenantId,
          frameworkId: template.id,
          parentId: input.parentId,
          kind: input.kind,
          labelFr: label,
          labelAr: input.labelAr?.trim() || null,
          descriptor: input.descriptor?.trim() || null,
          subjectId: input.subjectId || null,
          depth,
          order: (last?.order ?? 0) + 10,
          isLeaf: input.isLeaf,
        },
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'create',
        entityType: 'CompetencyNode',
        entityId: node.id,
        after: { labelFr: label, depth, parentId: input.parentId },
      });
      return node.id;
    });

    revalidatePath('/admin/settings/competences');
    return { ok: true, data: { id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/** Modifie un nœud du modèle. */
export async function updateTemplateNodeAction(
  nodeId: string,
  input: {
    labelFr: string;
    labelAr?: string;
    descriptor?: string;
    subjectId?: string | null;
    isLeaf?: boolean;
  },
): Promise<Result> {
  const session = await guard();
  if (!session) return { ok: false, error: 'Non authentifié' };
  const label = input.labelFr.trim();
  if (!label) return { ok: false, error: 'Le libellé est requis.' };
  const tenantId = session.user.tenantId;

  try {
    await withTenant(tenantId, async (tx) => {
      const node = await tx.competencyNode.findUnique({
        where: { id: nodeId },
        select: { id: true, framework: { select: { isTemplate: true } }, _count: { select: { children: true } } },
      });
      if (!node) throw new Error('Nœud introuvable.');
      if (!node.framework.isTemplate) {
        throw new Error('Seul le référentiel modèle est modifiable ici.');
      }
      await tx.competencyNode.update({
        where: { id: nodeId },
        data: {
          labelFr: label,
          labelAr: input.labelAr?.trim() || null,
          descriptor: input.descriptor?.trim() || null,
          subjectId: input.subjectId === undefined ? undefined : input.subjectId || null,
          // Un nœud qui a des enfants ne peut pas devenir feuille.
          isLeaf: input.isLeaf === undefined ? undefined : input.isLeaf && node._count.children === 0,
        },
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'update',
        entityType: 'CompetencyNode',
        entityId: nodeId,
        after: { labelFr: label },
      });
    });
    revalidatePath('/admin/settings/competences');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/** Supprime un nœud du modèle et toute sa descendance. */
export async function deleteTemplateNodeAction(nodeId: string): Promise<Result<{ removed: number }>> {
  const session = await guard();
  if (!session) return { ok: false, error: 'Non authentifié' };
  const tenantId = session.user.tenantId;

  try {
    const removed = await withTenant(tenantId, async (tx) => {
      const node = await tx.competencyNode.findUnique({
        where: { id: nodeId },
        select: { id: true, frameworkId: true, framework: { select: { isTemplate: true } } },
      });
      if (!node) throw new Error('Nœud introuvable.');
      if (!node.framework.isTemplate) {
        throw new Error('Seul le référentiel modèle est modifiable ici.');
      }

      // Descendance complète : la cascade Prisma s'en chargerait, mais on veut
      // le compte exact pour le dire à l'utilisateur avant qu'il s'en aperçoive.
      const all = await tx.competencyNode.findMany({
        where: { frameworkId: node.frameworkId },
        select: { id: true, parentId: true },
      });
      const childrenOf = new Map<string | null, string[]>();
      for (const n of all) {
        const arr = childrenOf.get(n.parentId) ?? [];
        arr.push(n.id);
        childrenOf.set(n.parentId, arr);
      }
      const doomed: string[] = [];
      const walk = (id: string) => {
        doomed.push(id);
        for (const c of childrenOf.get(id) ?? []) walk(c);
      };
      walk(nodeId);

      await tx.competencyNode.deleteMany({ where: { id: { in: doomed } } });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'delete',
        entityType: 'CompetencyNode',
        entityId: nodeId,
        before: { removed: doomed.length },
      });
      return doomed.length;
    });

    revalidatePath('/admin/settings/competences');
    return { ok: true, data: { removed } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/**
 * Copie l'arbre d'un référentiel vers un autre, en remappant les parents.
 * Partagée par l'amorçage du modèle et l'import vers une année.
 */
async function copyNodes(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  tenantId: string,
  fromFrameworkId: string,
  toFrameworkId: string,
): Promise<number> {
  const nodes = await tx.competencyNode.findMany({
    where: { frameworkId: fromFrameworkId },
    include: { levels: { select: { levelId: true } } },
    orderBy: [{ depth: 'asc' }, { order: 'asc' }],
  });
  const idMap = new Map<string, string>();
  for (const n of nodes) {
    const copy = await tx.competencyNode.create({
      data: {
        tenantId,
        frameworkId: toFrameworkId,
        parentId: n.parentId ? (idMap.get(n.parentId) ?? null) : null,
        kind: n.kind,
        labelFr: n.labelFr,
        labelAr: n.labelAr,
        descriptor: n.descriptor,
        subjectId: n.subjectId,
        depth: n.depth,
        order: n.order,
        isLeaf: n.isLeaf,
      },
    });
    idMap.set(n.id, copy.id);
    for (const l of n.levels) {
      await tx.competencyNodeLevel.create({
        data: { tenantId, nodeId: copy.id, levelId: l.levelId },
      });
    }
  }
  return nodes.length;
}
