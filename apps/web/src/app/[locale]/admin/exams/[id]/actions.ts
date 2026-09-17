'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import {
  findScheduleConflicts,
  isWithinSession,
  minutesOfTime,
  type ScheduleConflict,
} from '@/lib/exam-schedule';
import { syncExamEvaluations } from '@/lib/exam-evaluations';

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

/**
 * Résultat d'une planification. Un refus pour cause de conflit transporte la
 * liste des épreuves en cause : l'agent doit voir *quoi* il percute avant de
 * décider de décaler ou de forcer.
 */
export type PaperResult =
  | { ok: true }
  | { ok: false; error: string; conflicts?: ScheduleConflict[] };

function parsePaperInput(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' ? v.trim() : '';
  };
  return {
    subjectId: get('subjectId'),
    date: get('date'),
    startTime: get('startTime'),
    durationMin: Number(get('durationMin')),
    coefficient: Number(get('coefficient') || '1'),
    maxValue: Number(get('maxValue') || '20'),
    /** L'agent a vu les conflits et choisit de passer outre. */
    force: formData.get('force') === 'on' || formData.get('force') === 'true',
  };
}

/**
 * Ajoute une épreuve à une session (RF-02.2), après contrôle d'incompatibilité
 * horaire (RF-02.3). Un conflit **bloque** par défaut ; l'agent peut forcer en
 * connaissance de cause — certains établissements dédoublent les surveillances
 * plutôt que de décaler une épreuve.
 */
export async function createExamPaperAction(
  sessionId: string,
  formData: FormData,
): Promise<PaperResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const input = parsePaperInput(formData);
  const invalid = validatePaperInput(input);
  if (invalid) return { ok: false, error: invalid };

  const tenantId = session.user.tenantId;
  const date = new Date(input.date);

  try {
    const conflicts = await withTenant(tenantId, async (tx) => {
      const exam = await tx.examSession.findUnique({
        where: { id: sessionId },
        select: { id: true, status: true, startDate: true, endDate: true, levelId: true },
      });
      if (!exam) throw new Error('Session introuvable.');
      if (exam.status === 'CLOSED') throw new Error('Session clôturée : plus aucune épreuve.');
      if (!isWithinSession(date, exam.startDate, exam.endDate)) {
        throw new Error(
          `La date doit tomber entre le ${exam.startDate.toLocaleDateString('fr-FR')} et le ${exam.endDate.toLocaleDateString('fr-FR')}.`,
        );
      }

      const found = await findScheduleConflicts(tx, {
        sessionId,
        date,
        startTime: input.startTime,
        durationMin: input.durationMin,
      });
      if (found.length > 0 && !input.force) return found;

      await tx.examPaper.create({
        data: {
          tenantId,
          sessionId,
          subjectId: input.subjectId,
          date,
          startTime: input.startTime,
          durationMin: input.durationMin,
          coefficient: input.coefficient,
          maxValue: input.maxValue,
        },
      });
      // Session publiée : l'épreuve devient aussitôt un devoir pour les enseignants.
      if (exam.status === 'PUBLISHED') await syncExamEvaluations(tx, tenantId, sessionId);
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'create',
        entityType: 'ExamPaper',
        entityId: sessionId,
        after: {
          subjectId: input.subjectId,
          date: input.date,
          startTime: input.startTime,
          durationMin: input.durationMin,
          forced: input.force && found.length > 0,
        },
      });
      return [];
    });

    if (conflicts.length > 0) {
      return { ok: false, error: 'CONFLICT', conflicts };
    }
    revalidatePath(`/admin/exams/${sessionId}`);
    revalidatePath('/admin/exams');
    return { ok: true };
  } catch (e) {
    if (e instanceof Error && e.message.includes('Unique constraint')) {
      return { ok: false, error: 'Une épreuve identique existe déjà (même matière, date et heure).' };
    }
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/** Modifie une épreuve — mêmes contrôles que la création. */
export async function updateExamPaperAction(
  paperId: string,
  formData: FormData,
): Promise<PaperResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const input = parsePaperInput(formData);
  const invalid = validatePaperInput(input);
  if (invalid) return { ok: false, error: invalid };

  const tenantId = session.user.tenantId;
  const date = new Date(input.date);
  let sessionId = '';

  try {
    const conflicts = await withTenant(tenantId, async (tx) => {
      const paper = await tx.examPaper.findUnique({
        where: { id: paperId },
        select: {
          id: true,
          sessionId: true,
          session: { select: { status: true, startDate: true, endDate: true } },
        },
      });
      if (!paper) throw new Error('Épreuve introuvable.');
      sessionId = paper.sessionId;
      if (paper.session.status === 'CLOSED') throw new Error('Session clôturée.');
      if (!isWithinSession(date, paper.session.startDate, paper.session.endDate)) {
        throw new Error('La date sort de la plage de la session.');
      }

      const found = await findScheduleConflicts(tx, {
        paperId,
        sessionId: paper.sessionId,
        date,
        startTime: input.startTime,
        durationMin: input.durationMin,
      });
      if (found.length > 0 && !input.force) return found;

      await tx.examPaper.update({
        where: { id: paperId },
        data: {
          subjectId: input.subjectId,
          date,
          startTime: input.startTime,
          durationMin: input.durationMin,
          coefficient: input.coefficient,
          maxValue: input.maxValue,
        },
      });
      if (paper.session.status === 'PUBLISHED') await syncExamEvaluations(tx, tenantId, paper.sessionId);
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'update',
        entityType: 'ExamPaper',
        entityId: paperId,
        after: { date: input.date, startTime: input.startTime, durationMin: input.durationMin },
      });
      return [];
    });

    if (conflicts.length > 0) {
      return { ok: false, error: 'CONFLICT', conflicts };
    }
    revalidatePath(`/admin/exams/${sessionId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/** Supprime une épreuve. Refusé dès qu'une note y est rattachée. */
export async function deleteExamPaperAction(paperId: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  const tenantId = session.user.tenantId;
  let sessionId = '';
  try {
    await withTenant(tenantId, async (tx) => {
      const paper = await tx.examPaper.findUnique({
        where: { id: paperId },
        select: {
          sessionId: true,
          session: { select: { status: true } },
          _count: { select: { marks: true, seats: true } },
        },
      });
      if (!paper) throw new Error('Épreuve introuvable.');
      sessionId = paper.sessionId;
      if (paper.session.status === 'CLOSED') throw new Error('Session clôturée.');
      if (paper._count.marks > 0) {
        throw new Error(
          `Impossible de supprimer : ${paper._count.marks} note(s) déjà saisie(s) sur cette épreuve.`,
        );
      }
      // Devoirs générés pour les enseignants : supprimés avec l'épreuve tant
      // qu'aucune note n'y est saisie ; sinon la suppression est refusée.
      const linked = await tx.evaluation.findMany({
        where: { examPaperId: paperId },
        select: { id: true, grades: { where: { value: { not: null } }, select: { id: true }, take: 1 } },
      });
      if (linked.some((e) => e.grades.length > 0)) {
        throw new Error('Impossible de supprimer : des enseignants ont déjà saisi des notes sur les devoirs issus de cette épreuve.');
      }
      if (linked.length > 0) await tx.evaluation.deleteMany({ where: { id: { in: linked.map((e) => e.id) } } });
      await tx.examPaper.delete({ where: { id: paperId } });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'delete',
        entityType: 'ExamPaper',
        entityId: paperId,
        before: { seats: paper._count.seats },
      });
    });
    revalidatePath(`/admin/exams/${sessionId}`);
    revalidatePath('/admin/exams');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/** Contrôles de forme communs à la création et à la modification. */
function validatePaperInput(input: ReturnType<typeof parsePaperInput>): string | null {
  if (!input.subjectId) return 'Matière requise.';
  if (!input.date || Number.isNaN(new Date(input.date).getTime())) return 'Date invalide.';
  if (minutesOfTime(input.startTime) === null) return 'Heure de début invalide (format HH:MM).';
  if (!Number.isFinite(input.durationMin) || input.durationMin < 15 || input.durationMin > 480) {
    return 'La durée doit être comprise entre 15 et 480 minutes.';
  }
  if (!Number.isFinite(input.coefficient) || input.coefficient <= 0 || input.coefficient > 20) {
    return 'Le coefficient doit être compris entre 0 et 20.';
  }
  if (!Number.isFinite(input.maxValue) || input.maxValue < 1 || input.maxValue > 100) {
    return 'La note maximale doit être comprise entre 1 et 100.';
  }
  return null;
}


/** Une épreuve posée sur un créneau par le planificateur. */
export type PlanningItem = {
  /** null = épreuve à créer ; sinon épreuve existante à replanifier. */
  paperId: string | null;
  subjectId: string;
  trackIds: string[];
  durationMin: number;
  coefficient: number;
  date: string;
  startTime: string;
};

/**
 * Enregistre le planning issu du glisser-déposer : crée les épreuves nouvelles,
 * replanifie celles qui ont bougé.
 *
 * Les lignes sont traitées une à une et le contrôle d'incompatibilité tourne
 * avant chaque écriture — donc une ligne en conflit est écartée sans bloquer
 * les autres. L'écran affiche ensuite ce qui n'est pas passé.
 */
export async function savePlanningAction(
  sessionId: string,
  items: PlanningItem[],
): Promise<PaperResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  if (items.length === 0) return { ok: true };

  const tenantId = session.user.tenantId;

  try {
    const conflicts = await withTenant(tenantId, async (tx) => {
      const exam = await tx.examSession.findUnique({
        where: { id: sessionId },
        select: { id: true, status: true, startDate: true, endDate: true },
      });
      if (!exam) throw new Error('Session introuvable.');
      if (exam.status === 'CLOSED') throw new Error('Session clôturée : planning verrouillé.');

      for (const it of items) {
        const date = new Date(it.date);
        if (Number.isNaN(date.getTime())) throw new Error('Date invalide dans le planning.');
        if (minutesOfTime(it.startTime) === null) throw new Error(`Heure invalide (${it.startTime}).`);
        if (!isWithinSession(date, exam.startDate, exam.endDate)) {
          throw new Error(`Une épreuve est posée hors de la plage de la session (${it.date}).`);
        }
      }

      const found: ScheduleConflict[] = [];
      for (const it of items) {
        const date = new Date(it.date);
        const c = await findScheduleConflicts(tx, {
          paperId: it.paperId,
          sessionId,
          date,
          startTime: it.startTime,
          durationMin: it.durationMin,
          trackIds: it.trackIds,
        });
        if (c.length > 0) {
          found.push(...c);
          continue;
        }
        if (it.paperId) {
          await tx.examPaper.update({
            where: { id: it.paperId },
            data: { date, startTime: it.startTime, durationMin: it.durationMin },
          });
        } else {
          await tx.examPaper.create({
            data: {
              tenantId,
              sessionId,
              subjectId: it.subjectId,
              date,
              startTime: it.startTime,
              durationMin: it.durationMin,
              coefficient: it.coefficient,
              maxValue: 20,
              tracks: { create: it.trackIds.map((trackId) => ({ tenantId, trackId })) },
            },
          });
        }
      }

      if (exam.status === 'PUBLISHED') await syncExamEvaluations(tx, tenantId, sessionId);
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'update',
        entityType: 'ExamSession',
        entityId: sessionId,
        after: { planned: items.length - found.length, conflicts: found.length },
      });
      return found;
    });

    revalidatePath(`/admin/exams/${sessionId}`);
    revalidatePath('/admin/exams');
    if (conflicts.length > 0) return { ok: false, error: 'CONFLICT', conflicts };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
