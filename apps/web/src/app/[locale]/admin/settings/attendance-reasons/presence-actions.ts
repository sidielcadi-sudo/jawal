'use server';

import { revalidatePath } from 'next/cache';
import type { Prisma } from '@jawal/db';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';

/** Active ou non « l'appel de l'enseignant vaut pointage de présence ». */
export async function setAppelCountsAsPresenceAction(
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { id: true, settings: true },
      });
      const settings = { ...((tenant.settings as Record<string, unknown> | null) ?? {}) };
      const block = { ...((settings.staffAttendance as Record<string, unknown> | undefined) ?? {}) };
      block.appelCountsAsPresence = enabled;
      settings.staffAttendance = block;
      await tx.tenant.update({
        where: { id: tenant.id },
        data: { settings: settings as Prisma.InputJsonValue },
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'update',
        entityType: 'Tenant',
        entityId: tenant.id,
        after: { appelCountsAsPresence: enabled },
      });
    });
    revalidatePath('/admin/settings/attendance-reasons');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
