'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { can, currentUserRoleCodes, requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { getTeacherPersonId } from '@/lib/teacher';
import { teacherCanAccessStudent } from '@/lib/carnet';
import { notifyCarnetEntries } from '@/lib/carnet-notify';

type Result = { ok: true } | { ok: false; error: string };

const TYPES = [
  'OBSERVATION',
  'ENCOURAGEMENT',
  'FELICITATION',
  'REMARQUE_DISCIPLINAIRE',
  'DEFAUT_CARNET',
  'AVERTISSEMENT',
  'EXCLUSION',
  'MESSAGE_DIRECTION',
  'CONVOCATION',
] as const;

/** Types qu'un enseignant peut saisir (le reste est réservé à la vie scolaire). */
const TEACHER_ALLOWED = new Set(['OBSERVATION', 'ENCOURAGEMENT', 'FELICITATION', 'DEFAUT_CARNET']);

const schema = z.object({
  studentId: z.string().uuid(),
  type: z.enum(TYPES),
  content: z.string().min(1).max(2000),
  classId: z.string().uuid().optional().nullable(),
  subjectId: z.string().uuid().optional().nullable(),
  occurredAt: z.coerce.date().optional(),
});

export async function addCarnetEntryAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };

  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
  };
  const parsed = schema.safeParse({
    studentId: get('studentId'),
    type: get('type'),
    content: get('content'),
    classId: get('classId') ?? null,
    subjectId: get('subjectId') ?? null,
    occurredAt: get('occurredAt'),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  const hasDiscipline = await can('discipline.write');
  const isTeacherAllowed = TEACHER_ALLOWED.has(parsed.data.type);
  if (!isTeacherAllowed && !hasDiscipline)
    return { ok: false, error: 'Type réservé à la vie scolaire / direction.' };

  const roleCodes = await currentUserRoleCodes();
  const authorRole = roleCodes.includes('direction')
    ? 'direction'
    : hasDiscipline
      ? 'vie-scolaire'
      : 'teacher';

  const tenantId = session.user.tenantId;
  try {
    const entryId = await withTenant(tenantId, async (tx) => {
      // Garde côté prof : accès à l'élève via ses classes.
      if (!hasDiscipline) {
        const teacherId = await getTeacherPersonId(tx, session.user.id);
        if (!teacherId) throw new Error('Profil enseignant introuvable.');
        if (!(await teacherCanAccessStudent(tx, teacherId, parsed.data.studentId)))
          throw new Error('Élève hors de vos classes.');
      }

      // Snapshot lisible de l'auteur.
      const link = await tx.userPerson.findFirst({
        where: { userId: session.user.id },
        include: { person: { select: { firstName: true, lastName: true } } },
      });
      const authorName = link?.person
        ? `${link.person.firstName} ${link.person.lastName}`
        : (session.user.email ?? 'Établissement');

      const entry = await tx.carnetEntry.create({
        data: {
          tenantId,
          studentId: parsed.data.studentId,
          type: parsed.data.type,
          content: parsed.data.content,
          classId: parsed.data.classId ?? null,
          subjectId: parsed.data.subjectId ?? null,
          occurredAt: parsed.data.occurredAt ?? new Date(),
          authorUserId: session.user.id,
          authorName,
          authorRole,
        },
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'create',
        entityType: 'CarnetEntry',
        entityId: entry.id,
        after: { type: entry.type, studentId: entry.studentId },
      });
      return entry.id;
    });
    // Notification e-mail aux parents (best-effort, hors transaction).
    await notifyCarnetEntries(tenantId, [entryId]);
    revalidatePath('/admin/carnet');
    revalidatePath('/enseignant/carnet');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/** Suppression réservée vie scolaire / direction. */
export async function deleteCarnetEntryAction(id: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('discipline.write');
  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      await tx.carnetEntry.delete({ where: { id } });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'delete',
        entityType: 'CarnetEntry',
        entityId: id,
      });
    });
    revalidatePath('/admin/carnet');
    revalidatePath('/enseignant/carnet');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
