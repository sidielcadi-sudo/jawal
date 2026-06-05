'use server';

import { revalidatePath } from 'next/cache';
import { lessonEntryUpsertSchema, lessonLinkInputSchema, type HomeworkInput } from '@jawal/shared';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { deleteObject } from '@/lib/storage';
import { getTeacherPersonId } from '@/lib/teacher';
import { upsertLesson, teacherOwnsLesson } from '@/lib/lesson-book';

type Result = { ok: true } | { ok: false; error: string };

/**
 * Saisie/maj du cahier de texte d'une séance par l'enseignant qui la donne.
 * L'appartenance de la séance + la cohérence de date sont revérifiées dans
 * `upsertLesson` (l'enseignant ne peut remplir que ses propres séances).
 */
export async function saveLessonAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  if (!session.user.isTeacher) return { ok: false, error: 'Réservé aux comptes enseignant.' };

  const homeworks = (() => {
    const v = formData.get('homeworks');
    if (typeof v !== 'string') return [];
    try {
      return JSON.parse(v) as HomeworkInput[];
    } catch {
      return [];
    }
  })();

  const parsed = lessonEntryUpsertSchema.safeParse({
    entryId: formData.get('entryId'),
    date: formData.get('date'),
    title: (formData.get('title') as string | null)?.trim() ?? '',
    summary: (formData.get('summary') as string | null)?.trim() || undefined,
    activities: (formData.get('activities') as string | null)?.trim() || undefined,
    competencies: (formData.get('competencies') as string | null)?.trim() || undefined,
    visibleToStudents: formData.get('visibleToStudents') !== 'false',
    visibleToParents: formData.get('visibleToParents') !== 'false',
    publishAt: (formData.get('publishAt') as string | null)?.trim() || undefined,
    homeworks,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Données invalides.' };
  }

  const tenantId = session.user.tenantId;
  const result = await withTenant(tenantId, async (tx) => {
    const teacherId = await getTeacherPersonId(tx, session.user.id);
    if (!teacherId) return { ok: false as const, error: 'Compte enseignant non lié à une fiche.' };
    const r = await upsertLesson(tx, tenantId, session.user.id, teacherId, parsed.data);
    if (!r.ok) {
      const msg =
        r.error === 'NOT_OWNER'
          ? "Cette séance n'est pas la vôtre."
          : 'La date ne correspond pas au jour de la séance.';
      return { ok: false as const, error: msg };
    }
    return { ok: true as const };
  });

  if (result.ok) {
    revalidatePath('/enseignant/cahier');
  }
  return result;
}

/** Ajoute un lien externe (ressource) à une séance dont l'enseignant est le prof. */
export async function addLessonLinkAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  if (!session.user.isTeacher) return { ok: false, error: 'Réservé aux enseignants.' };

  const parsed = lessonLinkInputSchema.safeParse({
    lessonEntryId: formData.get('lessonEntryId'),
    url: (formData.get('url') as string | null)?.trim() ?? '',
    label: (formData.get('label') as string | null)?.trim() || undefined,
  });
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Lien invalide.' };

  const tenantId = session.user.tenantId;
  const r = await withTenant(tenantId, async (tx) => {
    const teacherId = await getTeacherPersonId(tx, session.user.id);
    if (!teacherId || !(await teacherOwnsLesson(tx, teacherId, parsed.data.lessonEntryId))) {
      return { ok: false as const, error: "Cette séance n'est pas la vôtre." };
    }
    const count = await tx.lessonResource.count({
      where: { lessonEntryId: parsed.data.lessonEntryId },
    });
    await tx.lessonResource.create({
      data: {
        tenantId,
        lessonEntryId: parsed.data.lessonEntryId,
        kind: 'LINK',
        url: parsed.data.url,
        label: parsed.data.label || parsed.data.url,
        order: count,
      },
    });
    return { ok: true as const };
  });

  if (r.ok) revalidatePath('/enseignant/cahier');
  return r;
}

/** Supprime une ressource (fichier MinIO + FileObject le cas échéant). */
export async function deleteLessonResourceAction(resourceId: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  if (!session.user.isTeacher) return { ok: false, error: 'Réservé aux enseignants.' };

  const tenantId = session.user.tenantId;
  const s3Key = await withTenant(tenantId, async (tx) => {
    const teacherId = await getTeacherPersonId(tx, session.user.id);
    const resource = await tx.lessonResource.findUnique({
      where: { id: resourceId },
      select: { lessonEntryId: true, fileId: true },
    });
    if (!resource) return null;
    if (!teacherId || !(await teacherOwnsLesson(tx, teacherId, resource.lessonEntryId)))
      return null;

    let key: string | null = null;
    if (resource.fileId) {
      const file = await tx.fileObject.findUnique({ where: { id: resource.fileId } });
      key = file?.s3Key ?? null;
      if (file) await tx.fileObject.delete({ where: { id: file.id } });
    }
    await tx.lessonResource.delete({ where: { id: resourceId } });
    return key;
  });

  if (s3Key) await deleteObject(s3Key);
  revalidatePath('/enseignant/cahier');
  return { ok: true };
}
