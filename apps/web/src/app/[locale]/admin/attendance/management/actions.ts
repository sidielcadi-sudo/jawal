'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import type { Prisma } from '@/lib/db';
import { notifyCarnetEntries } from '@/lib/carnet-notify';

type Result = { ok: true } | { ok: false; error: string };

const CARNET_LABEL: Record<string, string> = {
  ABSENCE: 'Absence',
  RETARD: 'Retard',
  EXCLUSION: 'Exclusion de cours',
};

async function authorName(
  tx: Prisma.TransactionClient,
  userId: string,
  email: string | null,
): Promise<string> {
  const link = await tx.userPerson.findFirst({
    where: { userId },
    include: { person: { select: { firstName: true, lastName: true } } },
  });
  return link?.person ? `${link.person.firstName} ${link.person.lastName}` : (email ?? 'Vie scolaire');
}

/**
 * Confirme un événement d'absence : matérialise une entrée de carnet (couche
 * communication), verrouille la session, notifie les parents. Ne modifie JAMAIS
 * le record du prof.
 */
export async function confirmEventAction(id: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('attendance.write');
  const tenantId = session.user.tenantId;
  try {
    const carnetId = await withTenant(tenantId, async (tx) => {
      const ev = await tx.attendanceEvent.findUnique({ where: { id } });
      if (!ev) throw new Error('Événement introuvable.');
      const cls = await tx.class.findUnique({ where: { id: ev.classId }, select: { name: true } });
      const label = CARNET_LABEL[ev.category] ?? ev.category;
      const content =
        `${label} confirmée le ${ev.date.toLocaleDateString('fr-FR')}` +
        (cls?.name ? ` — ${cls.name}` : '') +
        (ev.category === 'RETARD' && ev.lateMinutes ? ` (${ev.lateMinutes} min)` : '');

      let carnetEntryId = ev.carnetEntryId;
      const name = await authorName(tx, session.user.id, session.user.email ?? null);
      if (carnetEntryId) {
        await tx.carnetEntry.update({
          where: { id: carnetEntryId },
          data: { type: ev.category as never, content, visibleToParents: true },
        });
      } else {
        const entry = await tx.carnetEntry.create({
          data: {
            tenantId,
            studentId: ev.studentId,
            type: ev.category as never,
            content,
            classId: ev.classId,
            attendanceSessionId: ev.sessionId,
            occurredAt: ev.date,
            authorUserId: session.user.id,
            authorName: name,
            authorRole: 'vie-scolaire',
            visibleToParents: true,
          },
        });
        carnetEntryId = entry.id;
      }

      await tx.attendanceEvent.update({
        where: { id },
        data: { status: 'CONFIRMED', processedByUserId: session.user.id, processedAt: new Date(), carnetEntryId },
      });
      await tx.attendanceSession.update({ where: { id: ev.sessionId }, data: { vsLocked: true } });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'confirm',
        entityType: 'AttendanceEvent',
        entityId: id,
      });
      return carnetEntryId;
    });
    if (carnetId) await notifyCarnetEntries(tenantId, [carnetId]);
    revalidatePath('/admin/attendance/management');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

export async function justifyEventAction(id: string, reason: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('attendance.write');
  if (!reason || reason.trim().length < 2) return { ok: false, error: 'Motif requis.' };
  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      await tx.attendanceEvent.update({
        where: { id },
        data: {
          status: 'JUSTIFIED',
          justifReason: reason.trim(),
          processedByUserId: session.user.id,
          processedAt: new Date(),
        },
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'justify',
        entityType: 'AttendanceEvent',
        entityId: id,
      });
    });
    revalidatePath('/admin/attendance/management');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/** Annule l'événement (erreur de saisie côté prof). Le record du prof reste tel quel. */
export async function cancelEventAction(id: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('attendance.write');
  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const ev = await tx.attendanceEvent.findUnique({ where: { id } });
      if (!ev) throw new Error('Événement introuvable.');
      if (ev.carnetEntryId) {
        await tx.carnetEntry.deleteMany({ where: { id: ev.carnetEntryId } });
      }
      await tx.attendanceEvent.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          carnetEntryId: null,
          processedByUserId: session.user.id,
          processedAt: new Date(),
        },
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'cancel',
        entityType: 'AttendanceEvent',
        entityId: id,
      });
    });
    revalidatePath('/admin/attendance/management');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/** Convertit l'événement absence↔retard (sur l'événement, jamais sur le record). */
export async function convertEventAction(id: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('attendance.write');
  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const ev = await tx.attendanceEvent.findUnique({ where: { id } });
      if (!ev) throw new Error('Événement introuvable.');
      const next = ev.category === 'ABSENCE' ? 'RETARD' : ev.category === 'RETARD' ? 'ABSENCE' : null;
      if (!next) throw new Error('Conversion possible seulement entre absence et retard.');
      await tx.attendanceEvent.update({
        where: { id },
        data: { category: next, processedByUserId: session.user.id, processedAt: new Date() },
      });
      if (ev.carnetEntryId) {
        await tx.carnetEntry.update({ where: { id: ev.carnetEntryId }, data: { type: next as never } });
      }
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'convert',
        entityType: 'AttendanceEvent',
        entityId: id,
        after: { category: next },
      });
    });
    revalidatePath('/admin/attendance/management');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
