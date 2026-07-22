'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getTeacherPersonId } from '@/lib/teacher';
import { loadActiveFramework, loadLeaves, evaluableBy } from '@/lib/competences';

type Result = { ok: true; saved?: number } | { ok: false; error: string };

/**
 * Enregistre les évaluations d'une classe sur une feuille de compétence.
 * Une ligne par (élève, feuille, période, **enseignant**) : deux professeurs
 * peuvent évaluer la même aptitude transversale sans s'écraser — la synthèse
 * se fait ensuite par moyenne.
 */
export async function saveCompetencyAssessmentsAction(
  nodeId: string,
  periodId: string,
  records: { studentId: string; masteryLevelId: string | null }[],
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  const tenantId = session.user.tenantId;
  const userId = session.user.id;

  try {
    const saved = await withTenant(tenantId, async (tx) => {
      const teacherId = await getTeacherPersonId(tx, userId);
      if (!teacherId) throw new Error('Profil enseignant introuvable.');

      const framework = await loadActiveFramework(tx);
      if (!framework) throw new Error('Aucun référentiel actif.');

      // Contrôle d'accès : l'enseignant doit avoir le droit d'évaluer cet item.
      const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });
      const assignments = await tx.teacherAssignment.findMany({
        where: { teacherId, academicYearId: year?.id },
        select: { subjectId: true },
      });
      const entries = await tx.timetableEntry.findMany({
        where: { teacherId, academicYearId: year?.id },
        select: { subjectId: true },
      });
      const mySubjects = [...new Set([...assignments, ...entries].map((a) => a.subjectId).filter((s): s is string => !!s))];
      const leaves = await loadLeaves(tx, framework.id);
      const allowed = evaluableBy(leaves, mySubjects).some((l) => l.id === nodeId);
      if (!allowed) throw new Error("Vous n'êtes pas autorisé à évaluer cette compétence.");

      let count = 0;
      for (const r of records) {
        if (!r.masteryLevelId) {
          // Niveau vidé → on retire l'évaluation de cet enseignant.
          await tx.competencyAssessment.deleteMany({
            where: { studentId: r.studentId, nodeId, periodId, evaluatedByUserId: userId },
          });
          continue;
        }
        await tx.competencyAssessment.upsert({
          where: {
            studentId_nodeId_periodId_evaluatedByUserId: {
              studentId: r.studentId,
              nodeId,
              periodId,
              evaluatedByUserId: userId,
            },
          },
          create: {
            tenantId,
            studentId: r.studentId,
            nodeId,
            periodId,
            masteryLevelId: r.masteryLevelId,
            evaluatedByUserId: userId,
            source: 'CLASS',
          },
          update: { masteryLevelId: r.masteryLevelId },
        });
        count++;
      }
      return count;
    });

    revalidatePath('/enseignant/competences');
    return { ok: true, saved };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/**
 * Saisie en lot depuis la grille de classe (multi-colonnes).
 * Chaque cellule cible une ou plusieurs feuilles (`nodeIds`) : une seule pour
 * une sous-compétence académique, toutes les facettes pour une aptitude évaluée
 * globalement. Le niveau choisi s'applique à toutes les feuilles de la cellule.
 */
export async function saveClassGridAction(
  periodId: string,
  cells: { studentId: string; nodeIds: string[]; masteryLevelId: string | null }[],
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  const tenantId = session.user.tenantId;
  const userId = session.user.id;

  try {
    const saved = await withTenant(tenantId, async (tx) => {
      const teacherId = await getTeacherPersonId(tx, userId);
      if (!teacherId) throw new Error('Profil enseignant introuvable.');
      const framework = await loadActiveFramework(tx);
      if (!framework) throw new Error('Aucun référentiel actif.');

      const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });
      const [assignments, entries] = await Promise.all([
        tx.teacherAssignment.findMany({ where: { teacherId, academicYearId: year?.id }, select: { subjectId: true } }),
        tx.timetableEntry.findMany({ where: { teacherId, academicYearId: year?.id }, select: { subjectId: true } }),
      ]);
      const mySubjects = [...new Set([...assignments, ...entries].map((a) => a.subjectId).filter((s): s is string => !!s))];
      const leaves = await loadLeaves(tx, framework.id);
      const allowedIds = new Set(evaluableBy(leaves, mySubjects).map((l) => l.id));

      let count = 0;
      for (const cell of cells) {
        for (const nodeId of cell.nodeIds) {
          if (!allowedIds.has(nodeId)) continue; // hors périmètre : ignoré silencieusement
          if (!cell.masteryLevelId) {
            await tx.competencyAssessment.deleteMany({
              where: { studentId: cell.studentId, nodeId, periodId, evaluatedByUserId: userId },
            });
            continue;
          }
          await tx.competencyAssessment.upsert({
            where: { studentId_nodeId_periodId_evaluatedByUserId: { studentId: cell.studentId, nodeId, periodId, evaluatedByUserId: userId } },
            create: { tenantId, studentId: cell.studentId, nodeId, periodId, masteryLevelId: cell.masteryLevelId, evaluatedByUserId: userId, source: 'CLASS' },
            update: { masteryLevelId: cell.masteryLevelId },
          });
          count++;
        }
      }
      return count;
    });

    revalidatePath('/enseignant/competences');
    return { ok: true, saved };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
