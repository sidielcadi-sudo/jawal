'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { evaluationCreateSchema, gradesBulkSaveSchema } from '@jawal/shared';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { getTeacherPersonId, teacherTeachesClassSubject } from '@/lib/teacher';

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

function flatten(parsed: z.SafeParseError<unknown>): string {
  return parsed.error.issues[0]?.message ?? 'Données invalides';
}

/**
 * Crée une évaluation pour la classe + matière de l'enseignant (matière figée
 * côté serveur) et pré-initialise un Grade vide par élève inscrit. Garde :
 * l'enseignant doit bien enseigner cette matière dans cette classe.
 */
export async function createTeacherEvaluationAction(
  formData: FormData,
): Promise<Result<{ id: string }>> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('grades.write');

  const classId = String(formData.get('classId') ?? '');
  const subjectId = String(formData.get('subjectId') ?? '');
  const parsed = evaluationCreateSchema.safeParse({
    classId,
    subjectId,
    periodId: formData.get('periodId'),
    label: formData.get('label'),
    date: formData.get('date'),
    weight: formData.get('weight') || 1,
    maxValue: formData.get('maxValue') || 20,
  });
  if (!parsed.success) return { ok: false, error: flatten(parsed) };

  const tenantId = session.user.tenantId;
  try {
    const id = await withTenant(tenantId, async (tx) => {
      const teacherId = await getTeacherPersonId(tx, session.user.id);
      if (!teacherId) throw new Error('Profil enseignant introuvable.');
      if (!(await teacherTeachesClassSubject(tx, teacherId, classId, subjectId)))
        throw new Error('Matière/classe non autorisée.');

      const cls = await tx.class.findUnique({
        where: { id: classId },
        include: { students: { where: { unenrolledAt: null }, select: { studentId: true } } },
      });
      if (!cls) throw new Error('Classe introuvable.');

      const ev = await tx.evaluation.create({
        data: {
          tenantId,
          classId,
          subjectId,
          periodId: parsed.data.periodId,
          label: parsed.data.label,
          date: parsed.data.date,
          weight: parsed.data.weight,
          maxValue: parsed.data.maxValue,
        },
      });
      if (cls.students.length > 0) {
        await tx.grade.createMany({
          data: cls.students.map((sc) => ({
            tenantId,
            evaluationId: ev.id,
            studentId: sc.studentId,
            value: null,
          })),
        });
      }
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'create',
        entityType: 'Evaluation',
        entityId: ev.id,
        after: { source: 'teacher', label: ev.label, subjectId, periodId: ev.periodId },
      });
      return ev.id;
    });
    revalidatePath(`/enseignant/classes/${classId}/grades/${subjectId}`);
    return { ok: true, data: { id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/** Saisie/MAJ des notes d'une évaluation (garde via la matière de l'évaluation). */
export async function saveTeacherGradesAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('grades.write');

  const raw = formData.get('payload');
  if (typeof raw !== 'string') return { ok: false, error: 'Payload manquant' };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'JSON invalide' };
  }
  const parsed = gradesBulkSaveSchema.safeParse(json);
  if (!parsed.success) return { ok: false, error: flatten(parsed) };

  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const teacherId = await getTeacherPersonId(tx, session.user.id);
      if (!teacherId) throw new Error('Profil enseignant introuvable.');

      const ev = await tx.evaluation.findUnique({ where: { id: parsed.data.evaluationId } });
      if (!ev) throw new Error('Évaluation introuvable.');
      if (!(await teacherTeachesClassSubject(tx, teacherId, ev.classId, ev.subjectId)))
        throw new Error('Évaluation non autorisée.');

      for (const g of parsed.data.grades) {
        if (g.value !== null && g.value > ev.maxValue)
          throw new Error(`Note ${g.value} > max ${ev.maxValue}.`);
        await tx.grade.upsert({
          where: { evaluationId_studentId: { evaluationId: ev.id, studentId: g.studentId } },
          update: { value: g.value, comment: g.comment ?? null, enteredByUserId: session.user.id },
          create: {
            tenantId,
            evaluationId: ev.id,
            studentId: g.studentId,
            value: g.value,
            comment: g.comment ?? null,
            enteredByUserId: session.user.id,
          },
        });
      }
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'save',
        entityType: 'EvaluationGrades',
        entityId: ev.id,
        after: { source: 'teacher', count: parsed.data.grades.length },
      });
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/** Supprime une évaluation (garde via sa matière/classe). */
export async function deleteTeacherEvaluationAction(
  evaluationId: string,
  classId: string,
  subjectId: string,
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('grades.write');
  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const teacherId = await getTeacherPersonId(tx, session.user.id);
      if (!teacherId) throw new Error('Profil enseignant introuvable.');
      const ev = await tx.evaluation.findUnique({ where: { id: evaluationId } });
      if (!ev || ev.classId !== classId || ev.subjectId !== subjectId)
        throw new Error('Évaluation introuvable.');
      if (!(await teacherTeachesClassSubject(tx, teacherId, ev.classId, ev.subjectId)))
        throw new Error('Évaluation non autorisée.');
      await tx.evaluation.delete({ where: { id: evaluationId } });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'delete',
        entityType: 'Evaluation',
        entityId: evaluationId,
        before: { label: ev.label },
      });
    });
    revalidatePath(`/enseignant/classes/${classId}/grades/${subjectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
