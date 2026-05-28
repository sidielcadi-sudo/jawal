'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';

type Result = { ok: true } | { ok: false; error: string };

const roomSchema = z.object({
  code: z.string().min(1).max(40),
  label: z.string().min(1).max(120),
  capacity: z.coerce.number().int().min(0).max(2000).default(0),
  equipment: z.string().optional(),
});

function input(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' ? v.trim() : '';
  };
  return {
    code: get('code'),
    label: get('label'),
    capacity: get('capacity'),
    equipment: get('equipment'),
  };
}

function parseEquipment(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function createRoomAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const parsed = roomSchema.safeParse(input(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const room = await tx.room.create({
        data: {
          tenantId,
          code: parsed.data.code,
          label: parsed.data.label,
          capacity: parsed.data.capacity,
          equipment: parseEquipment(parsed.data.equipment),
        },
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'create',
        entityType: 'Room',
        entityId: room.id,
        after: { code: room.code, label: room.label, capacity: room.capacity },
      });
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('Unique constraint')) {
      return { ok: false, error: 'Ce code de salle existe déjà.' };
    }
    throw e;
  }
  revalidatePath('/admin/settings/rooms');
  return { ok: true };
}

export async function updateRoomAction(id: string, formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const parsed = roomSchema.safeParse(input(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    const before = await tx.room.findUnique({ where: { id } });
    if (!before) throw new Error('Salle introuvable');
    await tx.room.update({
      where: { id },
      data: {
        code: parsed.data.code,
        label: parsed.data.label,
        capacity: parsed.data.capacity,
        equipment: parseEquipment(parsed.data.equipment),
      },
    });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'update',
      entityType: 'Room',
      entityId: id,
      before: { code: before.code, label: before.label, capacity: before.capacity },
      after: { code: parsed.data.code, label: parsed.data.label, capacity: parsed.data.capacity },
    });
  });
  revalidatePath('/admin/settings/rooms');
  return { ok: true };
}

export async function deleteRoomAction(id: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    const before = await tx.room.findUnique({ where: { id } });
    if (!before) throw new Error('Salle introuvable');
    await tx.room.delete({ where: { id } });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'delete',
      entityType: 'Room',
      entityId: id,
      before: { code: before.code, label: before.label },
    });
  });
  revalidatePath('/admin/settings/rooms');
  return { ok: true };
}
