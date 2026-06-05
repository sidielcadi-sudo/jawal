import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { presignedGet } from '@/lib/storage';
import { getParentChildren } from '@/lib/parent';
import { getTeacherPersonId } from '@/lib/teacher';
import { resolveResourceForDownload } from '@/lib/lesson-book';

/**
 * Téléchargement d'une ressource fichier du cahier de texte, avec contrôle
 * d'accès selon le profil (enseignant propriétaire / parent autorisé / admin).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;
  const tenantId = session.user.tenantId;

  const file = await withTenant(tenantId, async (tx) => {
    const isParent = session.user.isParent;
    const isTeacher = session.user.isTeacher;
    const parentClassIds = isParent
      ? (await getParentChildren(tx, session.user.id))
          .map((c) => c.classId)
          .filter((v): v is string => v !== null)
      : [];
    const teacherPersonId = isTeacher ? await getTeacherPersonId(tx, session.user.id) : null;

    return resolveResourceForDownload(tx, {
      resourceId: id,
      isParent,
      isTeacher,
      userId: session.user.id,
      parentClassIds,
      teacherPersonId,
    });
  });

  if (!file) return new Response('Ressource introuvable ou accès refusé', { status: 404 });

  const url = await presignedGet(file.s3Key, 15 * 60);
  return Response.redirect(url, 302);
}
