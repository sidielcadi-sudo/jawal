'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { timetableSlotCreateSchema } from '@jawal/shared';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';

type Result = { ok: true } | { ok: false; error: string };

function input(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' ? v.trim() : v;
  };
  return {
    startTime: typeof get('startTime') === 'string' ? (get('startTime') as string) : '',
    endTime: typeof get('endTime') === 'string' ? (get('endTime') as string) : '',
    label: typeof get('label') === 'string' ? (get('label') as string) : '',
    isBreak: formData.get('isBreak') === 'on' || formData.get('isBreak') === 'true',
    order: typeof get('order') === 'string' ? (get('order') as string) : '0',
  };
}

export async function createSlotAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const parsed = timetableSlotCreateSchema.safeParse(input(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const slot = await tx.timetableSlot.create({
        data: {
          tenantId,
          startTime: parsed.data.startTime,
          endTime: parsed.data.endTime,
          label: parsed.data.label ?? null,
          isBreak: parsed.data.isBreak,
          order: parsed.data.order,
        },
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'create',
        entityType: 'TimetableSlot',
        entityId: slot.id,
        after: { startTime: slot.startTime, endTime: slot.endTime, isBreak: slot.isBreak },
      });
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('Unique constraint')) {
      return { ok: false, error: 'Ce créneau horaire existe déjà.' };
    }
    throw e;
  }
  revalidatePath('/admin/settings/timetable-slots');
  return { ok: true };
}

export async function updateSlotAction(id: string, formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const parsed = timetableSlotCreateSchema.safeParse(input(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      await tx.timetableSlot.update({
        where: { id },
        data: {
          startTime: parsed.data.startTime,
          endTime: parsed.data.endTime,
          label: parsed.data.label ?? null,
          isBreak: parsed.data.isBreak,
          order: parsed.data.order,
        },
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'update',
        entityType: 'TimetableSlot',
        entityId: id,
        after: { startTime: parsed.data.startTime, endTime: parsed.data.endTime },
      });
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('Unique constraint')) {
      return { ok: false, error: 'Ce créneau horaire existe déjà.' };
    }
    throw e;
  }
  revalidatePath('/admin/settings/timetable-slots');
  return { ok: true };
}

export async function deleteSlotAction(id: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      // Refuse la suppression si des entrées y pointent
      const used = await tx.timetableEntry.count({ where: { slotId: id } });
      if (used > 0) {
        throw new Error(
          `Ce créneau est utilisé dans ${used} case(s) d'emploi du temps. Supprimez-les d'abord.`,
        );
      }
      await tx.timetableSlot.delete({ where: { id } });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'delete',
        entityType: 'TimetableSlot',
        entityId: id,
      });
    });
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
  revalidatePath('/admin/settings/timetable-slots');
  return { ok: true };
}
