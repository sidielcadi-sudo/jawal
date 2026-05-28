'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { classCreateSchema, classUpdateSchema, enrollStudentSchema } from '@jawal/shared';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

function flatten<T>(parsed: z.SafeParseError<T>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join('.');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

function formInput(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
  };
  return {
    name: get('name'),
    academicYearId: get('academicYearId'),
    levelId: get('levelId'),
    capacity: get('capacity'),
    mainTeacherId: get('mainTeacherId'),
  };
}

export async function createClassAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('classes.write');

  const parsed = classCreateSchema.safeParse(formInput(formData));
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides.', fieldErrors: flatten(parsed) };
  }

  const tenantId = session.user.tenantId;

  try {
    const created = await withTenant(tenantId, async (tx) => {
      const cls = await tx.class.create({
        data: {
          tenantId,
          name: parsed.data.name,
          academicYearId: parsed.data.academicYearId,
          levelId: parsed.data.levelId,
          capacity: parsed.data.capacity,
          mainTeacherId: parsed.data.mainTeacherId ?? null,
        },
      });

      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'create',
        entityType: 'Class',
        entityId: cls.id,
        after: { name: cls.name, levelId: cls.levelId, capacity: cls.capacity },
      });

      return cls;
    });

    revalidatePath('/admin/classes');
    return { ok: true, data: { id: created.id } };
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('Unique constraint')) {
      return { ok: false, error: 'Une classe avec ce nom existe déjà pour cette année.' };
    }
    throw e;
  }
}

export async function updateClassAction(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('classes.write');

  const parsed = classUpdateSchema.safeParse(formInput(formData));
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides.', fieldErrors: flatten(parsed) };
  }

  const tenantId = session.user.tenantId;

  await withTenant(tenantId, async (tx) => {
    const before = await tx.class.findUnique({ where: { id } });
    if (!before) throw new Error('Classe introuvable');

    const updated = await tx.class.update({
      where: { id },
      data: {
        name: parsed.data.name,
        capacity: parsed.data.capacity,
        mainTeacherId: parsed.data.mainTeacherId ?? null,
      },
    });

    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'update',
      entityType: 'Class',
      entityId: id,
      before: { name: before.name, capacity: before.capacity, mainTeacherId: before.mainTeacherId },
      after: { name: updated.name, capacity: updated.capacity, mainTeacherId: updated.mainTeacherId },
    });
  });

  revalidatePath('/admin/classes');
  revalidatePath(`/admin/classes/${id}`);
  return { ok: true };
}

export async function softDeleteClassAction(id: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('classes.write');

  const tenantId = session.user.tenantId;

  await withTenant(tenantId, async (tx) => {
    const before = await tx.class.findUnique({ where: { id } });
    if (!before) throw new Error('Classe introuvable');

    await tx.class.update({ where: { id }, data: { deletedAt: new Date() } });

    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'delete',
      entityType: 'Class',
      entityId: id,
      before: { name: before.name },
    });
  });

  revalidatePath('/admin/classes');
  redirect('/admin/classes');
}

export async function restoreClassAction(id: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('classes.write');

  const tenantId = session.user.tenantId;

  await withTenant(tenantId, async (tx) => {
    await tx.class.update({ where: { id }, data: { deletedAt: null } });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'restore',
      entityType: 'Class',
      entityId: id,
    });
  });

  revalidatePath('/admin/classes');
  revalidatePath(`/admin/classes/${id}`);
  return { ok: true };
}

export async function enrollStudentAction(
  classId: string,
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('classes.write');

  const parsed = enrollStudentSchema.safeParse({ studentId: formData.get('studentId') });
  if (!parsed.success) return { ok: false, error: 'Élève invalide.' };

  const { studentId } = parsed.data;
  const tenantId = session.user.tenantId;

  try {
    await withTenant(tenantId, async (tx) => {
      const cls = await tx.class.findUnique({
        where: { id: classId },
        include: { _count: { select: { students: { where: { unenrolledAt: null } } } } },
      });
      if (!cls) throw new Error('Classe introuvable');
      if (cls.deletedAt) throw new Error('Classe archivée — réactiver avant inscription');
      if (cls._count.students >= cls.capacity) {
        throw new Error(`Capacité atteinte (${cls.capacity}).`);
      }

      const student = await tx.person.findUnique({ where: { id: studentId } });
      if (!student || student.type !== 'STUDENT') throw new Error('Élève introuvable');

      // Réactiver une inscription précédente si elle existe (unenrolledAt != null)
      const existing = await tx.studentClass.findUnique({
        where: { studentId_classId: { studentId, classId } },
      });

      if (existing) {
        if (!existing.unenrolledAt) {
          throw new Error('Élève déjà inscrit à cette classe.');
        }
        await tx.studentClass.update({
          where: { id: existing.id },
          data: { unenrolledAt: null, enrolledAt: new Date() },
        });
      } else {
        await tx.studentClass.create({
          data: { tenantId, studentId, classId },
        });
      }

      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'enroll',
        entityType: 'StudentClass',
        entityId: studentId,
        after: { studentId, classId },
      });
    });

    revalidatePath(`/admin/classes/${classId}`);
    revalidatePath(`/admin/persons/${studentId}`);
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inscription' };
  }
}

export async function unenrollStudentAction(
  classId: string,
  studentId: string,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('classes.write');

  const tenantId = session.user.tenantId;

  await withTenant(tenantId, async (tx) => {
    const sc = await tx.studentClass.findUnique({
      where: { studentId_classId: { studentId, classId } },
    });
    if (!sc || sc.unenrolledAt) throw new Error('Inscription introuvable');

    await tx.studentClass.update({
      where: { id: sc.id },
      data: { unenrolledAt: new Date() },
    });

    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'unenroll',
      entityType: 'StudentClass',
      entityId: studentId,
      before: { studentId, classId },
    });
  });

  revalidatePath(`/admin/classes/${classId}`);
  revalidatePath(`/admin/persons/${studentId}`);
  return { ok: true };
}
