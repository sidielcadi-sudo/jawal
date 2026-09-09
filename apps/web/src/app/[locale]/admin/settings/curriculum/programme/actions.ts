'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';

type Result = { ok: true } | { ok: false; error: string };

const SCHEMA = z.object({
  levelId: z.string().uuid(),
  subjectId: z.string().uuid(),
  weeklyHours: z.coerce.number().min(0).max(60),
  coefficient: z.coerce.number().min(0.1).max(20),
  order: z.coerce.number().int().min(0).max(99).default(0),
});

function input(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' ? v.trim() : '';
  };
  return {
    levelId: get('levelId'),
    subjectId: get('subjectId'),
    weeklyHours: get('weeklyHours'),
    coefficient: get('coefficient'),
    order: get('order') || '0',
  };
}

export async function upsertCurriculumSubjectAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const parsed = SCHEMA.safeParse(input(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    const existing = await tx.curriculumSubject.findUnique({
      where: { levelId_subjectId: { levelId: parsed.data.levelId, subjectId: parsed.data.subjectId } },
    });
    if (existing) {
      await tx.curriculumSubject.update({
        where: { id: existing.id },
        data: {
          weeklyHours: parsed.data.weeklyHours,
          coefficient: parsed.data.coefficient,
          order: parsed.data.order,
        },
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'update',
        entityType: 'CurriculumSubject',
        entityId: existing.id,
        before: { weeklyHours: existing.weeklyHours, coefficient: existing.coefficient },
        after: { weeklyHours: parsed.data.weeklyHours, coefficient: parsed.data.coefficient },
      });
    } else {
      const c = await tx.curriculumSubject.create({
        data: { tenantId, ...parsed.data },
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'create',
        entityType: 'CurriculumSubject',
        entityId: c.id,
        after: parsed.data,
      });
    }
  });
  revalidatePath('/admin/settings/curriculum/programme');
  return { ok: true };
}

export async function deleteCurriculumSubjectAction(id: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    await tx.curriculumSubject.delete({ where: { id } });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'delete',
      entityType: 'CurriculumSubject',
      entityId: id,
    });
  });
  revalidatePath('/admin/settings/curriculum/programme');
  return { ok: true };
}

/* ────────────────────────────────────────────────────────────────────────
   Programme d'une FILIÈRE (lycée)
   ──────────────────────────────────────────────────────────────────────── */

/**
 * Au lycée, le programme ne dépend pas du niveau mais de la filière : deux
 * élèves de 2BAC n'ont ni le même horaire ni le même coefficient selon qu'ils
 * sont en Sciences Maths ou en Lettres. Les lignes vivent donc dans
 * `TrackSubjectCoefficient`, qui porte trois valeurs distinctes :
 *
 *   - `weeklyHours`   : volume horaire hebdomadaire ;
 *   - `ccCoefficient` : coefficient de la moyenne semestrielle ;
 *   - `coefficient`   : coefficient de l'examen certificatif (Bac).
 *
 * Les deux derniers diffèrent réellement (2BAC SMA : 7 en contrôle continu,
 * 9 au Bac) — les confondre fausserait soit les bulletins, soit le Bac.
 */
export async function upsertTrackCurriculumAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' ? v.trim() : '';
  };
  const trackId = get('trackId');
  const subjectId = get('subjectId');
  const weeklyHours = Number(get('weeklyHours') || '0');
  const ccCoefficient = Number(get('ccCoefficient') || '0');

  if (!trackId || !subjectId) return { ok: false, error: 'Filière et matière requises.' };
  if (!Number.isFinite(weeklyHours) || weeklyHours < 0 || weeklyHours > 40) {
    return { ok: false, error: 'Le volume horaire doit être compris entre 0 et 40 h.' };
  }
  if (!Number.isFinite(ccCoefficient) || ccCoefficient <= 0 || ccCoefficient > 20) {
    return { ok: false, error: 'Le coefficient doit être compris entre 0 et 20.' };
  }

  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const track = await tx.track.findUnique({ where: { id: trackId }, select: { id: true } });
      if (!track) throw new Error('Filière introuvable.');
      await tx.trackSubjectCoefficient.upsert({
        where: { trackId_subjectId: { trackId, subjectId } },
        update: { weeklyHours, ccCoefficient },
        // À la création on ne présume rien du coefficient d'examen : 1 par
        // défaut, l'écran « Filières & barèmes » le renseigne s'il y a lieu.
        create: { tenantId, trackId, subjectId, coefficient: 1, weeklyHours, ccCoefficient },
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'update',
        entityType: 'TrackCurriculum',
        entityId: trackId,
        after: { subjectId, weeklyHours, ccCoefficient },
      });
    });
    revalidatePath('/admin/settings/curriculum/programme');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/**
 * Retire une matière du programme d'une filière. La ligne porte aussi le
 * coefficient d'examen : si celui-ci est renseigné (> 1), on se contente
 * d'effacer l'horaire pour ne pas perdre le paramétrage du Bac.
 */
export async function removeTrackCurriculumAction(
  trackId: string,
  subjectId: string,
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const row = await tx.trackSubjectCoefficient.findUnique({
        where: { trackId_subjectId: { trackId, subjectId } },
        select: { id: true, coefficient: true, certifying: true },
      });
      if (!row) return;
      if (row.coefficient > 1 || row.certifying) {
        await tx.trackSubjectCoefficient.update({
          where: { id: row.id },
          data: { weeklyHours: null, ccCoefficient: null },
        });
      } else {
        await tx.trackSubjectCoefficient.delete({ where: { id: row.id } });
      }
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'delete',
        entityType: 'TrackCurriculum',
        entityId: trackId,
        before: { subjectId },
      });
    });
    revalidatePath('/admin/settings/curriculum/programme');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
