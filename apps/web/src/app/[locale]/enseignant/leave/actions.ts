'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { workingDaysBetween } from '@/lib/leave';
import { getTeacherPersonId } from '@/lib/teacher';
import { alertTeacherAbsence } from '@/lib/leave-alerts';

type Result = { ok: true } | { ok: false; error: string };

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
};

/**
 * Auto-déclaration d'absence par l'enseignant (étape 1 du workflow de
 * remplacement). La demande est créée au statut PENDING pour SA propre personne
 * et déclenche une alerte vers la vie scolaire et la direction.
 */
export async function createOwnLeaveRequestAction(fd: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user?.isTeacher) return { ok: false, error: 'Non autorisé' };
  const tenantId = session.user.tenantId;

  const leaveTypeId = str(fd, 'leaveTypeId');
  const start = str(fd, 'startDate');
  const end = str(fd, 'endDate');
  if (!leaveTypeId || !start || !end) return { ok: false, error: 'Champs requis manquants.' };
  const startDate = new Date(`${start}T00:00:00.000Z`);
  const endDate = new Date(`${end}T00:00:00.000Z`);
  if (endDate < startDate) return { ok: false, error: 'La date de fin précède la date de début.' };
  const days = workingDaysBetween(startDate, endDate);

  try {
    await withTenant(tenantId, async (tx) => {
      const personId = await getTeacherPersonId(tx, session.user.id);
      if (!personId) throw new Error('Profil enseignant introuvable.');

      const overlap = await tx.leaveRequest.count({
        where: {
          personId,
          status: { in: ['PENDING', 'APPROVED'] },
          startDate: { lte: endDate },
          endDate: { gte: startDate },
        },
      });
      if (overlap > 0) throw new Error('Une demande chevauche déjà cette période.');

      const r = await tx.leaveRequest.create({
        data: {
          tenantId,
          personId,
          leaveTypeId,
          startDate,
          endDate,
          days,
          reason: str(fd, 'reason') ?? null,
          status: 'PENDING',
        },
        include: {
          person: { select: { firstName: true, lastName: true } },
          leaveType: { select: { labelFr: true } },
        },
      });
      await alertTeacherAbsence(tx, tenantId, {
        leaveId: r.id,
        teacherName: `${r.person.lastName} ${r.person.firstName}`,
        typeLabel: r.leaveType.labelFr,
        start: startDate,
        end: endDate,
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'create',
        entityType: 'LeaveRequest',
        entityId: r.id,
        after: { personId, leaveTypeId, days, selfDeclared: true },
      });
    });
    revalidatePath('/enseignant/leave');
    revalidatePath('/admin/leave');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/** Annulation par l'enseignant de sa propre demande, tant qu'elle est PENDING. */
export async function cancelOwnLeaveRequestAction(id: string): Promise<Result> {
  const session = await auth();
  if (!session?.user?.isTeacher) return { ok: false, error: 'Non autorisé' };
  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const personId = await getTeacherPersonId(tx, session.user.id);
      const req = await tx.leaveRequest.findUnique({ where: { id }, select: { personId: true, status: true } });
      if (!req || req.personId !== personId) throw new Error('Demande introuvable.');
      if (req.status !== 'PENDING') throw new Error('Seule une demande en attente peut être annulée.');
      await tx.leaveRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
    });
    revalidatePath('/enseignant/leave');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
