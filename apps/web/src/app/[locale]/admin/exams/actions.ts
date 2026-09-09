'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

const KINDS = ['SEMESTRIEL', 'REGIONAL', 'NATIONAL', 'BLANC'] as const;
type Kind = (typeof KINDS)[number];

/** Crée une session d'examen (RF-02.1). Les épreuves s'ajoutent ensuite. */
export async function createExamSessionAction(formData: FormData): Promise<Result<{ id: string }>> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' ? v.trim() : '';
  };
  const label = get('label');
  const kind = get('kind') as Kind;
  const levelId = get('levelId');
  const periodId = get('periodId') || null;
  const startDate = get('startDate');
  const endDate = get('endDate');
  const trackIds = formData.getAll('trackIds').filter((v): v is string => typeof v === 'string');
  const mixClasses = formData.get('mixClasses') === 'on';
  const anonymized = formData.get('anonymized') === 'on';

  if (!label) return { ok: false, error: 'Intitulé requis.' };
  if (!KINDS.includes(kind)) return { ok: false, error: 'Type d’examen invalide.' };
  if (!levelId) return { ok: false, error: 'Niveau requis.' };
  if (!startDate || !endDate) return { ok: false, error: 'Dates de début et de fin requises.' };
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { ok: false, error: 'Dates invalides.' };
  }
  if (end < start) return { ok: false, error: 'La date de fin précède la date de début.' };

  const tenantId = session.user.tenantId;
  try {
    const id = await withTenant(tenantId, async (tx) => {
      const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });
      if (!year) throw new Error('Aucune année scolaire active.');

      // Les filières retenues doivent appartenir au niveau de la session —
      // sinon on planifierait des épreuves pour des élèves qui n'existent pas.
      if (trackIds.length > 0) {
        const valid = await tx.track.count({ where: { id: { in: trackIds }, levelId } });
        if (valid !== trackIds.length) {
          throw new Error('Une filière sélectionnée n’appartient pas à ce niveau.');
        }
      }

      const created = await tx.examSession.create({
        data: {
          tenantId,
          academicYearId: year.id,
          levelId,
          periodId,
          label,
          kind,
          startDate: start,
          endDate: end,
          mixClasses,
          anonymized,
          tracks: { create: trackIds.map((trackId) => ({ tenantId, trackId })) },
        },
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'create',
        entityType: 'ExamSession',
        entityId: created.id,
        after: { label, kind, levelId, tracks: trackIds.length },
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
    revalidatePath('/admin/exams');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
