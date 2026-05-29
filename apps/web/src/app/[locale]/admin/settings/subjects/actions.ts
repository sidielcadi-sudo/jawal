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
      return { ok: false, error: 'Ce code de matière existe déjà.' };
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
      return { ok: false, error: 'Ce code existe déjà pour une autre matière.' };
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
      return { ok: false, error: 'Impossible de supprimer : des évaluations sont rattachées.' };
    }
    throw e;
  }
  revalidatePath('/admin/settings/subjects');
  return { ok: true };
}
