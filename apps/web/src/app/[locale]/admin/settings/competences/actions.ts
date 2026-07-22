'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { requireRoleCode } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';

type Result = { ok: true } | { ok: false; error: string };

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
