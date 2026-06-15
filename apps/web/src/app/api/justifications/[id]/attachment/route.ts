import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { can } from '@/lib/auth/rbac';
import { parentCanAccessChild } from '@/lib/parent';
import { presignedGet } from '@/lib/storage';

/**
 * Télécharge le justificatif d'une absence (justification) via une URL S3
 * présignée. Accès : la Vie scolaire (attendance.write) ou le parent de l'élève
 * concerné.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;
  const tenantId = session.user.tenantId;

  const result = await withTenant(tenantId, async (tx) => {
    const j = await tx.absenceJustification.findUnique({
      where: { id },
      select: {
        attachmentUrl: true,
        attendanceRecord: { select: { studentId: true } },
      },
    });
    if (!j?.attachmentUrl) return { status: 404 as const };

    const isStaff = await can('attendance.write');
    const isParent = await parentCanAccessChild(tx, session.user.id, j.attendanceRecord.studentId);
    if (!isStaff && !isParent) return { status: 403 as const };

    return { status: 200 as const, s3Key: j.attachmentUrl };
  });

  if (result.status === 404) return new Response('Aucun justificatif.', { status: 404 });
  if (result.status === 403) return new Response('Accès refusé.', { status: 403 });

  const url = await presignedGet(result.s3Key, 15 * 60);
  return Response.redirect(url, 302);
}
