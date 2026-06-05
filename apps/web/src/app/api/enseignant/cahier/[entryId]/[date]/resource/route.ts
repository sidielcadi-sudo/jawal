import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { putObject } from '@/lib/storage';
import { getTeacherPersonId } from '@/lib/teacher';
import { parseDateUTC, dowOf } from '@/lib/lesson-book';

const MAX_SIZE = 10 * 1024 * 1024; // 10 Mo
const ALLOWED = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ entryId: string; date: string }> },
) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  if (!session.user.isTeacher) return new Response('Réservé aux enseignants', { status: 403 });

  const { entryId, date } = await params;
  if (!ISO_DATE.test(date)) return new Response('Date invalide', { status: 400 });

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return new Response('Fichier manquant', { status: 400 });
  if (file.size > MAX_SIZE) return new Response('Fichier > 10 Mo', { status: 413 });
  if (!ALLOWED.has(file.type)) return new Response('Type de fichier non autorisé', { status: 415 });

  const tenantId = session.user.tenantId;
  const buffer = Buffer.from(await file.arrayBuffer());

  // Vérifie propriété de la séance + existence du cahier (doit être enregistré).
  const ctx = await withTenant(tenantId, async (tx) => {
    const teacherId = await getTeacherPersonId(tx, session.user.id);
    if (!teacherId) return { error: 'NO_TEACHER' as const };
    const entry = await tx.timetableEntry.findUnique({
      where: { id: entryId },
      select: { teacherId: true, dayOfWeek: true },
    });
    if (!entry || entry.teacherId !== teacherId) return { error: 'NOT_OWNER' as const };
    if (dowOf(date) !== entry.dayOfWeek) return { error: 'DATE_MISMATCH' as const };
    const lesson = await tx.lessonEntry.findUnique({
      where: { entryId_date: { entryId, date: parseDateUTC(date) } },
      select: { id: true },
    });
    if (!lesson) return { error: 'NO_LESSON' as const };
    return { lessonId: lesson.id };
  });

  if ('error' in ctx && ctx.error) {
    const map: Record<string, [string, number]> = {
      NO_TEACHER: ['Compte non lié à une fiche enseignant', 403],
      NOT_OWNER: ["Cette séance n'est pas la vôtre", 403],
      DATE_MISMATCH: ['Date incohérente', 400],
      NO_LESSON: ['Enregistrez d’abord le cahier de la séance', 409],
    };
    const [msg, code] = map[ctx.error] ?? ['Erreur', 400];
    return new Response(msg, { status: code });
  }

  const put = await putObject({
    buffer,
    filename: file.name,
    mime: file.type,
    tenantId,
    ownerType: 'lesson.resource',
    ownerId: ctx.lessonId,
  });

  await withTenant(tenantId, async (tx) => {
    const fileObj = await tx.fileObject.create({
      data: {
        tenantId,
        ownerType: 'lesson.resource',
        ownerId: ctx.lessonId,
        s3Key: put.s3Key,
        filename: put.filename,
        mime: put.mime,
        sizeBytes: put.sizeBytes,
      },
    });
    const count = await tx.lessonResource.count({ where: { lessonEntryId: ctx.lessonId } });
    await tx.lessonResource.create({
      data: {
        tenantId,
        lessonEntryId: ctx.lessonId,
        kind: 'FILE',
        fileId: fileObj.id,
        label: put.filename,
        order: count,
      },
    });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'upload',
      entityType: 'LessonResource',
      entityId: ctx.lessonId,
      after: { filename: put.filename, sizeBytes: put.sizeBytes },
    });
  });

  return Response.json({ ok: true });
}
