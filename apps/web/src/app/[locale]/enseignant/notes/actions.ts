'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { getTeacherPersonId, teacherTeachesClassSubject } from '@/lib/teacher';

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

/** Crée un « devoir » (évaluation) = nouvelle colonne dans la grille de saisie. */
const devoirSchema = z
  .object({
    classId: z.string().uuid(),
    subjectId: z.string().uuid(),
    periodId: z.string().uuid(),
    label: z.string().min(1).max(60),
    date: z.coerce.date(),
    maxValue: z.coerce.number().min(1).max(1000).default(20),
    weight: z.coerce.number().min(0.1).max(100).default(1),
    optional: z.boolean().default(false),
    optionalMode: z.enum(['BONUS', 'NOTE']).default('BONUS'),
  })
  .refine((d) => !Number.isNaN(d.date.getTime()), { message: 'Date invalide' });

function readDevoir(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' ? v.trim() : '';
  };
  return {
    classId: get('classId'),
    subjectId: get('subjectId'),
    periodId: get('periodId'),
    label: get('label'),
    date: get('date'),
    maxValue: get('maxValue') || 20,
    weight: get('weight') || 1,
    optional: formData.get('optional') === 'on' || formData.get('optional') === 'true',
    optionalMode: (get('optionalMode') as 'BONUS' | 'NOTE') || 'BONUS',
  };
}

export async function createDevoirAction(formData: FormData): Promise<Result<{ id: string }>> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('grades.write');

  const parsed = devoirSchema.safeParse(readDevoir(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  const tenantId = session.user.tenantId;
  try {
    const id = await withTenant(tenantId, async (tx) => {
      const teacherId = await getTeacherPersonId(tx, session.user.id);
      if (!teacherId) throw new Error('Profil enseignant introuvable.');
      if (!(await teacherTeachesClassSubject(tx, teacherId, parsed.data.classId, parsed.data.subjectId)))
        throw new Error('Matière/classe non autorisée.');

      const cls = await tx.class.findUnique({
        where: { id: parsed.data.classId },
        include: { students: { where: { unenrolledAt: null }, select: { studentId: true } } },
      });
      if (!cls) throw new Error('Classe introuvable.');

      const ev = await tx.evaluation.create({
        data: {
          tenantId,
          classId: parsed.data.classId,
          subjectId: parsed.data.subjectId,
          periodId: parsed.data.periodId,
          label: parsed.data.label,
          date: parsed.data.date,
          weight: parsed.data.weight,
          maxValue: parsed.data.maxValue,
          optional: parsed.data.optional,
          optionalMode: parsed.data.optionalMode,
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
        after: { source: 'teacher-notes', label: ev.label },
      });
      return ev.id;
    });
    revalidatePath('/enseignant/notes');
    return { ok: true, data: { id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/** Modifie les paramètres d'un devoir existant (libellé, date, barème, coeff, facultatif). */
export async function updateDevoirAction(
  evaluationId: string,
  formData: FormData,
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('grades.write');
  const parsed = devoirSchema.safeParse(readDevoir(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const teacherId = await getTeacherPersonId(tx, session.user.id);
      if (!teacherId) throw new Error('Profil enseignant introuvable.');
      const ev = await tx.evaluation.findUnique({ where: { id: evaluationId } });
      if (!ev) throw new Error('Devoir introuvable.');
      if (!(await teacherTeachesClassSubject(tx, teacherId, ev.classId, ev.subjectId)))
        throw new Error('Devoir non autorisé.');
      await tx.evaluation.update({
        where: { id: evaluationId },
        data: {
          label: parsed.data.label,
          date: parsed.data.date,
          maxValue: parsed.data.maxValue,
          weight: parsed.data.weight,
          optional: parsed.data.optional,
          optionalMode: parsed.data.optionalMode,
        },
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'update',
        entityType: 'Evaluation',
        entityId: evaluationId,
        after: { label: parsed.data.label, optional: parsed.data.optional },
      });
    });
    revalidatePath('/enseignant/notes');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

export async function deleteDevoirAction(evaluationId: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('grades.write');
  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const teacherId = await getTeacherPersonId(tx, session.user.id);
      if (!teacherId) throw new Error('Profil enseignant introuvable.');
      const ev = await tx.evaluation.findUnique({ where: { id: evaluationId } });
      if (!ev) throw new Error('Devoir introuvable.');
      if (!(await teacherTeachesClassSubject(tx, teacherId, ev.classId, ev.subjectId)))
        throw new Error('Devoir non autorisé.');
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
    revalidatePath('/enseignant/notes');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/**
 * Enregistre (ou efface) l'appréciation d'un élève pour une matière + période,
 * depuis le relevé. Réservé au prof qui enseigne (classe × matière).
 */
const appreciationSchema = z.object({
  studentId: z.string().uuid(),
  classId: z.string().uuid(),
  subjectId: z.string().uuid(),
  periodId: z.string().uuid(),
  text: z.string().max(2000),
});

export async function saveSubjectAppreciationAction(input: {
  studentId: string;
  classId: string;
  subjectId: string;
  periodId: string;
  text: string;
}): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('grades.write');
  const parsed = appreciationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };
  const tenantId = session.user.tenantId;
  const text = parsed.data.text.trim();

  try {
    await withTenant(tenantId, async (tx) => {
      const teacherId = await getTeacherPersonId(tx, session.user.id);
      if (!teacherId) throw new Error('Profil enseignant introuvable.');
      if (!(await teacherTeachesClassSubject(tx, teacherId, parsed.data.classId, parsed.data.subjectId)))
        throw new Error('Matière/classe non autorisée.');
      const inClass = await tx.studentClass.findFirst({
        where: { studentId: parsed.data.studentId, classId: parsed.data.classId, unenrolledAt: null },
        select: { id: true },
      });
      if (!inClass) throw new Error('Élève hors de la classe.');

      const where = {
        studentId_subjectId_periodId: {
          studentId: parsed.data.studentId,
          subjectId: parsed.data.subjectId,
          periodId: parsed.data.periodId,
        },
      };
      if (text === '') {
        await tx.subjectAppreciation.deleteMany({
          where: {
            studentId: parsed.data.studentId,
            subjectId: parsed.data.subjectId,
            periodId: parsed.data.periodId,
          },
        });
      } else {
        await tx.subjectAppreciation.upsert({
          where,
          update: { text, authoredByUserId: session.user.id },
          create: {
            tenantId,
            studentId: parsed.data.studentId,
            subjectId: parsed.data.subjectId,
            periodId: parsed.data.periodId,
            text,
            authoredByUserId: session.user.id,
          },
        });
      }
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: text === '' ? 'delete' : 'save',
        entityType: 'SubjectAppreciation',
        entityId: `${parsed.data.studentId}|${parsed.data.subjectId}|${parsed.data.periodId}`,
        after: { len: text.length },
      });
    });
    revalidatePath('/enseignant/notes/releve');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/** Sauvegarde groupée de toutes les notes de la grille (multi-devoirs). */
const matrixSchema = z.object({
  classId: z.string().uuid(),
  subjectId: z.string().uuid(),
  cells: z
    .array(
      z.object({
        evaluationId: z.string().uuid(),
        studentId: z.string().uuid(),
        value: z.number().min(0).max(1000).nullable(),
      }),
    )
    .max(10000),
});

export async function saveNotesMatrixAction(formData: FormData): Promise<Result> {
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
  const parsed = matrixSchema.safeParse(json);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const teacherId = await getTeacherPersonId(tx, session.user.id);
      if (!teacherId) throw new Error('Profil enseignant introuvable.');
      if (!(await teacherTeachesClassSubject(tx, teacherId, parsed.data.classId, parsed.data.subjectId)))
        throw new Error('Matière/classe non autorisée.');

      // Évaluations concernées : doivent appartenir à la classe + matière saisies.
      const evalIds = [...new Set(parsed.data.cells.map((c) => c.evaluationId))];
      const evals = await tx.evaluation.findMany({
        where: { id: { in: evalIds }, classId: parsed.data.classId, subjectId: parsed.data.subjectId },
        select: { id: true, maxValue: true },
      });
      const maxById = new Map(evals.map((e) => [e.id, e.maxValue]));

      for (const c of parsed.data.cells) {
        const max = maxById.get(c.evaluationId);
        if (max === undefined) throw new Error('Devoir non autorisé.');
        if (c.value !== null && c.value > max)
          throw new Error(`Note ${c.value} > barème ${max}.`);
        await tx.grade.upsert({
          where: { evaluationId_studentId: { evaluationId: c.evaluationId, studentId: c.studentId } },
          update: { value: c.value, enteredByUserId: session.user.id },
          create: {
            tenantId,
            evaluationId: c.evaluationId,
            studentId: c.studentId,
            value: c.value,
            enteredByUserId: session.user.id,
          },
        });
      }
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'save',
        entityType: 'EvaluationGrades',
        entityId: parsed.data.classId,
        after: { source: 'teacher-notes', cells: parsed.data.cells.length },
      });
    });
    revalidatePath('/enseignant/notes');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
