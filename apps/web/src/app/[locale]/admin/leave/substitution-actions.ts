'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';

type Result = { ok: true } | { ok: false; error: string };

/**
 * Affecte (ou retire) un remplaçant sur une séance datée, via TimetableOverride.
 * `value` : '' = retirer l'override, 'CANCELLED' = cours annulé, sinon = id du
 * prof remplaçant (kind SUBSTITUTION).
 */
export async function assignSubstituteAction(
  entryId: string,
  dateStr: string,
  value: string,
  leaveId: string,
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  const tenantId = session.user.tenantId;
  const date = new Date(`${dateStr}T00:00:00.000Z`);

  try {
    await withTenant(tenantId, async (tx) => {
      const entry = await tx.timetableEntry.findUnique({ where: { id: entryId }, select: { id: true, subjectId: true } });
      if (!entry) throw new Error('Séance introuvable.');

      if (value === '') {
        await tx.timetableOverride.deleteMany({ where: { entryId, date } });
      } else {
        const isCancel = value === 'CANCELLED';
        await tx.timetableOverride.upsert({
          where: { entryId_date: { entryId, date } },
          create: {
            tenantId,
            entryId,
            date,
            kind: isCancel ? 'CANCELLED' : 'SUBSTITUTION',
            substituteTeacherId: isCancel ? null : value,
            reason: 'Congé / absence',
            createdByUserId: session.user.id,
          },
          update: {
            kind: isCancel ? 'CANCELLED' : 'SUBSTITUTION',
            substituteTeacherId: isCancel ? null : value,
            reason: 'Congé / absence',
          },
        });
      }
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'substitute',
        entityType: 'TimetableEntry',
        entityId: entryId,
        after: { date: dateStr, value },
      });
    });
    revalidatePath(`/admin/leave/${leaveId}/remplacements`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
