'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';

type Result = { ok: true } | { ok: false; error: string };

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
};
const bool = (fd: FormData, k: string) => fd.get(k) === 'on' || fd.get(k) === 'true';

/** Champs « Santé & sécurité » d'un élève, stockés dans Person.metadata.health. */
export async function updateStudentHealthAction(studentId: string, fd: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('students.write');
  const tenantId = session.user.tenantId;

  const health = {
    allergies: str(fd, 'allergies') ?? null,
    chronicConditions: str(fd, 'chronicConditions') ?? null,
    treatments: str(fd, 'treatments') ?? null,
    pai: bool(fd, 'pai'),
    paiNote: str(fd, 'paiNote') ?? null,
    vaccinations: str(fd, 'vaccinations') ?? null,
    doctorName: str(fd, 'doctorName') ?? null,
    doctorPhone: str(fd, 'doctorPhone') ?? null,
    emergencyContactName: str(fd, 'emergencyContactName') ?? null,
    emergencyContactPhone: str(fd, 'emergencyContactPhone') ?? null,
    medAuthorization: bool(fd, 'medAuthorization'),
    outingAuthorization: bool(fd, 'outingAuthorization'),
  };

  try {
    await withTenant(tenantId, async (tx) => {
      const p = await tx.person.findUnique({ where: { id: studentId }, select: { metadata: true, type: true } });
      if (!p || p.type !== 'STUDENT') throw new Error('Élève introuvable.');
      const metadata = { ...((p.metadata as Record<string, unknown>) ?? {}), health };
      await tx.person.update({ where: { id: studentId }, data: { metadata } });
      await logAudit(tx, { tenantId, userId: session.user.id, action: 'update_health', entityType: 'Person', entityId: studentId });
    });
    revalidatePath(`/admin/persons/${studentId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
