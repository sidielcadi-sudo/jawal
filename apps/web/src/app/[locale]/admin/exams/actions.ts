'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { currentUserRoleCodes, requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import {
  isExamKind,
  isOfficialKind,
  sessionEditLock,
  todayIso,
  type ExamKindValue,
} from '@/lib/exam-kinds';
import { syncExamEvaluations } from '@/lib/exam-evaluations';
import { notifyExamPublished } from '@/lib/exam-notify';

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

type SessionFields = {
  label: string;
  kind: ExamKindValue;
  levelId: string;
  periodId: string | null;
  start: Date;
  end: Date;
  trackIds: string[];
  mixClasses: boolean;
  anonymized: boolean;
};

/** Lecture et contrôle du formulaire, communs à la création et à la modification. */
function readSessionForm(formData: FormData): { ok: true; data: SessionFields } | { ok: false; error: string } {
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' ? v.trim() : '';
  };
  const label = get('label');
  const kind = get('kind');
  const levelId = get('levelId');
  const startDate = get('startDate');
  const endDate = get('endDate');

  if (!label) return { ok: false, error: 'Intitulé requis.' };
  if (!isExamKind(kind)) return { ok: false, error: 'Type d’épreuve invalide.' };
  if (!levelId) return { ok: false, error: 'Niveau requis.' };
  if (!startDate || !endDate) return { ok: false, error: 'Dates de début et de fin requises.' };
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { ok: false, error: 'Dates invalides.' };
  }
  if (end < start) return { ok: false, error: 'La date de fin précède la date de début.' };

  return {
    ok: true,
    data: {
      label,
      kind,
      levelId,
      periodId: get('periodId') || null,
      start,
      end,
      trackIds: formData.getAll('trackIds').filter((v): v is string => typeof v === 'string'),
      mixClasses: formData.get('mixClasses') === 'on',
      anonymized: formData.get('anonymized') === 'on',
    },
  };
}

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];

/** Filières cohérentes avec le niveau, et examen officiel sur un niveau à filières. */
async function assertLevelAndTracks(tx: Tx, d: SessionFields) {
  // Les filières retenues doivent appartenir au niveau de la session —
  // sinon on planifierait des épreuves pour des élèves qui n'existent pas.
  if (d.trackIds.length > 0) {
    const valid = await tx.track.count({ where: { id: { in: d.trackIds }, levelId: d.levelId } });
    if (valid !== d.trackIds.length) {
      throw new Error('Une filière sélectionnée n’appartient pas à ce niveau.');
    }
  }
  // Un examen officiel se définit par ses filières : ce sont elles qui fixent
  // les épreuves et les coefficients. Sur un niveau sans filière, il n'a pas
  // de contenu possible.
  if (isOfficialKind(d.kind)) {
    const tracks = await tx.track.count({ where: { levelId: d.levelId, active: true } });
    if (tracks === 0) {
      throw new Error('Un examen officiel se programme sur un niveau à filières (1BAC, 2BAC).');
    }
  }
}

/** Crée une session d'examen (RF-02.1). Les épreuves s'ajoutent ensuite. */
export async function createExamSessionAction(formData: FormData): Promise<Result<{ id: string }>> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const parsed = readSessionForm(formData);
  if (!parsed.ok) return parsed;
  const d = parsed.data;

  const tenantId = session.user.tenantId;
  try {
    const id = await withTenant(tenantId, async (tx) => {
      const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });
      if (!year) throw new Error('Aucune année scolaire active.');
      await assertLevelAndTracks(tx, d);

      const created = await tx.examSession.create({
        data: {
          tenantId,
          academicYearId: year.id,
          levelId: d.levelId,
          periodId: d.periodId,
          label: d.label,
          kind: d.kind,
          startDate: d.start,
          endDate: d.end,
          mixClasses: d.mixClasses,
          anonymized: d.anonymized,
          tracks: { create: d.trackIds.map((trackId) => ({ tenantId, trackId })) },
        },
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'create',
        entityType: 'ExamSession',
        entityId: created.id,
        after: { label: d.label, kind: d.kind, levelId: d.levelId, tracks: d.trackIds.length },
      });
      return created.id;
    });
    revalidatePath('/admin/exams');
    return { ok: true, data: { id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/**
 * Modifie une session, tant qu'aucune note n'est saisie sur ses épreuves et que
 * sa date n'est pas échue (cf. `sessionEditLock`). Le contrôle est refait ici :
 * l'écran a pu être ouvert avant la première note.
 */
export async function updateExamSessionAction(
  sessionId: string,
  formData: FormData,
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const parsed = readSessionForm(formData);
  if (!parsed.ok) return parsed;
  const d = parsed.data;

  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const current = await tx.examSession.findUnique({
        where: { id: sessionId },
        select: {
          id: true,
          label: true,
          kind: true,
          levelId: true,
          status: true,
          endDate: true,
          papers: { select: { _count: { select: { marks: true } } } },
        },
      });
      if (!current) throw new Error('Session introuvable.');

      const markCount = current.papers.reduce((n, p) => n + p._count.marks, 0);
      const lock = sessionEditLock({ status: current.status, markCount, endDate: current.endDate }, todayIso());
      if (lock === 'CLOSED') throw new Error('Session clôturée : elle ne peut plus être modifiée.');
      if (lock === 'MARKS') throw new Error('Des notes sont saisies : la session ne peut plus être modifiée.');
      if (lock === 'PAST') throw new Error('La date de l’examen est échue : la session ne peut plus être modifiée.');

      // Les épreuves déjà posées appartiennent au niveau d'origine : changer de
      // niveau les laisserait rattachées à des élèves qui ne les passent pas.
      if (d.levelId !== current.levelId && current.papers.length > 0) {
        throw new Error('Des épreuves sont déjà planifiées : le niveau ne peut plus changer.');
      }
      await assertLevelAndTracks(tx, d);

      await tx.examSession.update({
        where: { id: sessionId },
        data: {
          label: d.label,
          kind: d.kind,
          levelId: d.levelId,
          periodId: d.periodId,
          startDate: d.start,
          endDate: d.end,
          mixClasses: d.mixClasses,
          anonymized: d.anonymized,
          tracks: {
            deleteMany: {},
            create: d.trackIds.map((trackId) => ({ tenantId, trackId })),
          },
        },
      });
      // Session publiée : ses devoirs suivent (filières ajoutées ou retirées).
      if (current.status === 'PUBLISHED') await syncExamEvaluations(tx, tenantId, sessionId);
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'update',
        entityType: 'ExamSession',
        entityId: sessionId,
        before: { label: current.label, kind: current.kind, levelId: current.levelId },
        after: { label: d.label, kind: d.kind, levelId: d.levelId, tracks: d.trackIds.length },
      });
    });
    revalidatePath('/admin/exams');
    revalidatePath(`/admin/exams/${sessionId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/**
 * Supprime une session et tout ce qui en dépend (épreuves, salles, notes).
 * Réservé à l'administrateur : c'est la seule action du module qui efface des
 * notes.
 */
export async function deleteExamSessionAction(sessionId: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  const roles = await currentUserRoleCodes();
  if (!roles.includes('tenant_admin')) {
    return { ok: false, error: 'Seul l’administrateur peut supprimer une session.' };
  }

  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const current = await tx.examSession.findUnique({
        where: { id: sessionId },
        select: {
          id: true,
          label: true,
          kind: true,
          papers: { select: { _count: { select: { marks: true } } } },
        },
      });
      if (!current) throw new Error('Session introuvable.');
      // Devoirs générés encore vierges : supprimés avec la session. Ceux qui
      // portent des notes restent dans le carnet des enseignants.
      await tx.evaluation.deleteMany({
        where: { examPaper: { is: { sessionId } }, grades: { none: { value: { not: null } } } },
      });
      await tx.examSession.delete({ where: { id: sessionId } });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'delete',
        entityType: 'ExamSession',
        entityId: sessionId,
        before: {
          label: current.label,
          kind: current.kind,
          papers: current.papers.length,
          marks: current.papers.reduce((n, p) => n + p._count.marks, 0),
        },
      });
    });
    revalidatePath('/admin/exams');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/**
 * Change le statut d'une session. `CLOSED` verrouille aussi le barème du
 * niveau : à la clôture, plus aucune note n'entre (RF-01.3).
 */
export async function setExamSessionStatusAction(
  sessionId: string,
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED',
): Promise<Result> {
  const auths = await auth();
  if (!auths?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  const tenantId = auths.user.tenantId;
  let wasPublished = true;
  try {
    await withTenant(tenantId, async (tx) => {
      const s = await tx.examSession.findUnique({
        where: { id: sessionId },
        select: { id: true, academicYearId: true, levelId: true, status: true },
      });
      if (!s) throw new Error('Session introuvable.');
      await tx.examSession.update({
        where: { id: sessionId },
        data: {
          status,
          publishedAt: status === 'PUBLISHED' ? new Date() : undefined,
          closedAt: status === 'CLOSED' ? new Date() : null,
          closedByUserId: status === 'CLOSED' ? auths.user.id : null,
        },
      });
      if (status === 'PUBLISHED') {
        // Un devoir par épreuve et par classe du niveau, pour la saisie des
        // notes par les enseignants concernés.
        await syncExamEvaluations(tx, tenantId, sessionId);
        wasPublished = s.status === 'PUBLISHED';
      }
      if (status === 'CLOSED') {
        await tx.gradingRule.updateMany({
          where: { academicYearId: s.academicYearId, levelId: s.levelId },
          data: { locked: true },
        });
      }
      await logAudit(tx, {
        tenantId,
        userId: auths.user.id,
        action: 'update',
        entityType: 'ExamSession',
        entityId: sessionId,
        before: { status: s.status },
        after: { status },
      });
    });
    // Publication : le calendrier part aux parents et aux élèves (une fois).
    if (status === 'PUBLISHED' && !wasPublished) await notifyExamPublished(tenantId, sessionId);
    revalidatePath('/admin/exams');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
