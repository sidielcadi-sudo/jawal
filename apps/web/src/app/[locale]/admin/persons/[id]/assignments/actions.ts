'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { cycleViolations } from '@/lib/teacher-allocation';

type Result = { ok: true } | { ok: false; error: string };

const SCHEMA = z.object({
  subjectId: z.string().uuid(),
  classId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  hoursPerWeek: z.coerce.number().min(0).max(40).optional(),
});

function input(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' ? v.trim() : '';
  };
  return {
    subjectId: get('subjectId'),
    classId: get('classId'),
    academicYearId: get('academicYearId'),
    hoursPerWeek: get('hoursPerWeek') || undefined,
  };
}

export async function createAssignmentAction(
  teacherId: string,
  formData: FormData,
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const parsed = SCHEMA.safeParse(input(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const teacher = await tx.person.findUnique({ where: { id: teacherId } });
      if (!teacher || teacher.type !== 'TEACHER') {
        throw new Error("Affectations réservées aux enseignants.");
      }
      // Un professeur ne va que dans les cycles de sa fiche (« Niveaux enseignés »).
      const bad = await cycleViolations(tx, [{ teacherId, classId: parsed.data.classId }]);
      if (bad.length > 0) {
        throw new Error(
          `${bad[0]} : la classe ne relève d'aucun cycle déclaré dans la fiche de l'enseignant (Niveaux enseignés).`,
        );
      }
      const a = await tx.teacherAssignment.create({
        data: { tenantId, teacherId, ...parsed.data },
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'create',
        entityType: 'TeacherAssignment',
        entityId: a.id,
        after: parsed.data,
      });
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('Unique constraint')) {
      return { ok: false, error: 'Cette affectation existe déjà.' };
    }
    return { ok: false, error: e instanceof Error ? e.message : 'Échec' };
  }
  revalidatePath(`/admin/persons/${teacherId}/assignments`);
  revalidatePath(`/admin/persons/${teacherId}`);
  return { ok: true };
}

export async function deleteAssignmentAction(
  teacherId: string,
  assignmentId: string,
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    await tx.teacherAssignment.delete({ where: { id: assignmentId } });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'delete',
      entityType: 'TeacherAssignment',
      entityId: assignmentId,
    });
  });
  revalidatePath(`/admin/persons/${teacherId}/assignments`);
  revalidatePath(`/admin/persons/${teacherId}`);
  return { ok: true };
}
