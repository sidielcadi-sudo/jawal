'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { evaluationCreateSchema, gradesBulkSaveSchema } from '@jawal/shared';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';

type Result<T = void> =
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

/**
 * Crée une évaluation pour une classe + matière + période et
 * pré-initialise un Grade vide (value=null) par élève inscrit.
 */
export async function createEvaluationAction(
  formData: FormData,
): Promise<Result<{ id: string }>> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('grades.write');

  const parsed = evaluationCreateSchema.safeParse({
    classId: formData.get('classId'),
    subjectId: formData.get('subjectId'),
    periodId: formData.get('periodId'),
    label: formData.get('label'),
    date: formData.get('date'),
    weight: formData.get('weight') || 1,
    maxValue: formData.get('maxValue') || 20,
  });
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides.', fieldErrors: flatten(parsed) };
  }

  const tenantId = session.user.tenantId;

  // Période d'une session d'examen : les devoirs viennent de la session.
  const period = await withTenant(tenantId, (tx) =>
    tx.period.findUnique({ where: { id: parsed.data.periodId }, select: { kind: true } }),
  );
  if (period?.kind === 'SESSION') {
    return {
      ok: false,
      error: "Période de session d'examen : les évaluations sont générées par la session, elles ne se créent pas ici.",
    };
  }

  const ev = await withTenant(tenantId, async (tx) => {
    const cls = await tx.class.findUnique({
      where: { id: parsed.data.classId },
      include: { students: { where: { unenrolledAt: null }, select: { studentId: true } } },
    });
    if (!cls) throw new Error('Classe introuvable');

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
      after: { label: ev.label, subjectId: ev.subjectId, periodId: ev.periodId },
    });
    return ev;
  });

  revalidatePath(`/admin/classes/${parsed.data.classId}/grades`);
  return { ok: true, data: { id: ev.id } };
}

export async function deleteEvaluationAction(evaluationId: string, classId: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('grades.write');

  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    const before = await tx.evaluation.findUnique({ where: { id: evaluationId } });
    if (!before) throw new Error('Évaluation introuvable');
    await tx.evaluation.delete({ where: { id: evaluationId } });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'delete',
      entityType: 'Evaluation',
      entityId: evaluationId,
      before: { label: before.label },
    });
  });
  revalidatePath(`/admin/classes/${classId}/grades`);
  return { ok: true };
}

export async function saveGradesAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('grades.write');

  const raw = formData.get('payload');
  if (typeof raw !== 'string') return { ok: false, error: 'Payload manquant' };
  let parsedJson;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'JSON invalide' };
  }

  const parsed = gradesBulkSaveSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides.', fieldErrors: flatten(parsed) };
  }

  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    const ev = await tx.evaluation.findUnique({ where: { id: parsed.data.evaluationId } });
    if (!ev) throw new Error('Évaluation introuvable');

    for (const g of parsed.data.grades) {
      // Validation côté serveur : note ≤ maxValue
      if (g.value !== null && g.value > ev.maxValue) {
        throw new Error(
          `Note ${g.value} > max ${ev.maxValue} pour l'élève ${g.studentId.slice(0, 8)}`,
        );
      }
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
      after: { count: parsed.data.grades.length },
    });
  });

  return { ok: true };
}
