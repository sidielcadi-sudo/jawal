import 'server-only';
import { z } from 'zod';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { getTeacherPersonId, teacherTeachesClassSubject } from '@/lib/teacher';

/**
 * Création d'un « devoir » (évaluation) par l'enseignant — cœur partagé entre
 * le portail web (server action) et l'API mobile. Les deux créent la même
 * colonne de saisie, avec les mêmes gardes : le prof doit enseigner le couple
 * classe × matière, et les notes vides sont pré-créées pour chaque inscrit.
 */
export const teacherDevoirSchema = z
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

export type TeacherDevoirInput = z.infer<typeof teacherDevoirSchema>;

/** Crée l'évaluation et ses notes vides. Lève si le service n'est pas au prof. */
export async function createTeacherDevoir(
  tenantId: string,
  userId: string,
  input: TeacherDevoirInput,
  source: string,
): Promise<string> {
  return withTenant(tenantId, async (tx) => {
    const teacherId = await getTeacherPersonId(tx, userId);
    if (!teacherId) throw new Error('Profil enseignant introuvable.');
    if (!(await teacherTeachesClassSubject(tx, teacherId, input.classId, input.subjectId)))
      throw new Error('Matière/classe non autorisée.');

    const cls = await tx.class.findUnique({
      where: { id: input.classId },
      include: { students: { where: { unenrolledAt: null }, select: { studentId: true } } },
    });
    if (!cls) throw new Error('Classe introuvable.');

    const ev = await tx.evaluation.create({
      data: {
        tenantId,
        classId: input.classId,
        subjectId: input.subjectId,
        periodId: input.periodId,
        label: input.label,
        date: input.date,
        weight: input.weight,
        maxValue: input.maxValue,
        optional: input.optional,
        optionalMode: input.optionalMode,
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
      userId,
      action: 'create',
      entityType: 'Evaluation',
      entityId: ev.id,
      after: { source, label: ev.label },
    });
    return ev.id;
  });
}
