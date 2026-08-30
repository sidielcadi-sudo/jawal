'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { subjectCreateSchema } from '@jawal/shared';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';

type Result = { ok: true } | { ok: false; error: string };

function input(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' ? v.trim() : '';
  };
  return {
    code: get('code'),
    label: get('label'),
    labelAr: get('labelAr'),
    scale: get('scale'),
    coefficient: get('coefficient'),
    order: get('order'),
  };
}

export async function createSubjectAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const parsed = subjectCreateSchema.safeParse(input(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const s = await tx.subject.create({ data: { tenantId, ...parsed.data } });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'create',
        entityType: 'Subject',
        entityId: s.id,
        after: parsed.data,
      });
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('Unique constraint')) {
      const onLabel = /label/i.test(e.message);
      return {
        ok: false,
        error: onLabel
          ? 'Une matière avec ce libellé existe déjà.'
          : 'Ce code de matière existe déjà.',
      };
    }
    throw e;
  }
  revalidatePath('/admin/settings/subjects');
  return { ok: true };
}

export async function updateSubjectAction(id: string, formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const parsed = subjectCreateSchema.safeParse(input(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const before = await tx.subject.findUnique({ where: { id } });
      if (!before) throw new Error('Matière introuvable');
      await tx.subject.update({ where: { id }, data: parsed.data });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'update',
        entityType: 'Subject',
        entityId: id,
        before: { label: before.label, coefficient: before.coefficient },
        after: { label: parsed.data.label, coefficient: parsed.data.coefficient },
      });
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('Unique constraint')) {
      const onLabel = /label/i.test(e.message);
      return {
        ok: false,
        error: onLabel
          ? 'Une autre matière porte déjà ce libellé.'
          : 'Ce code existe déjà pour une autre matière.',
      };
    }
    throw e;
  }
  revalidatePath('/admin/settings/subjects');
  return { ok: true };
}

export async function deleteSubjectAction(id: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const before = await tx.subject.findUnique({ where: { id } });
      if (!before) throw new Error('Matière introuvable');

      // Garde anti-cascade : supprimer une matière effacerait en chaîne ses
      // entrées de programme, évaluations (et notes !), affectations et cases d'EDT.
      // On refuse si elle est utilisée et on oriente vers « Programme par niveau ».
      const [curriculum, evaluations, assignments, timetable] = await Promise.all([
        tx.curriculumSubject.count({ where: { subjectId: id } }),
        tx.evaluation.count({ where: { subjectId: id } }),
        tx.teacherAssignment.count({ where: { subjectId: id } }),
        tx.timetableEntry.count({ where: { subjectId: id } }),
      ]);
      if (curriculum + evaluations + assignments + timetable > 0) {
        const parts: string[] = [];
        if (curriculum > 0) parts.push(`${curriculum} programme(s)`);
        if (evaluations > 0) parts.push(`${evaluations} évaluation(s)`);
        if (assignments > 0) parts.push(`${assignments} affectation(s)`);
        if (timetable > 0) parts.push(`${timetable} créneau(x) d'EDT`);
        throw new Error(
          `Impossible de supprimer « ${before.label} » : utilisée par ${parts.join(', ')}. ` +
            `Retirez-la d'abord du Programme par niveau (Paramètres → Programme).`,
        );
      }

      await tx.subject.delete({ where: { id } });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'delete',
        entityType: 'Subject',
        entityId: id,
        before: { label: before.label, code: before.code },
      });
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('Foreign key')) {
      return { ok: false, error: 'Impossible de supprimer : des éléments sont rattachés.' };
    }
    return { ok: false, error: e instanceof Error ? e.message : 'Suppression impossible.' };
  }
  revalidatePath('/admin/settings/subjects');
  return { ok: true };
}
