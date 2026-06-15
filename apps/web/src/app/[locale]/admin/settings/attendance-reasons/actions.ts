'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';

type Result = { ok: true } | { ok: false; error: string };

const COLORS = ['cyan', 'rose', 'blue', 'amber', 'green', 'red', 'purple', 'slate'] as const;

const schema = z.object({
  label: z.string().min(1).max(80),
  color: z.enum(COLORS).optional().nullable(),
  order: z.coerce.number().int().min(0).max(999).default(0),
  active: z.boolean().default(true),
});

function read(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' ? v.trim() : '';
  };
  return {
    label: get('label'),
    color: get('color') || null,
    order: get('order') || '0',
    active: formData.get('active') === 'on' || formData.get('active') === 'true',
  };
}

export async function createAttendanceReasonAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  const parsed = schema.safeParse(read(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };
  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    const r = await tx.attendanceReason.create({ data: { tenantId, ...parsed.data } });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'create',
      entityType: 'AttendanceReason',
      entityId: r.id,
      after: parsed.data,
    });
  });
  revalidatePath('/admin/settings/attendance-reasons');
  return { ok: true };
}

export async function updateAttendanceReasonAction(id: string, formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  const parsed = schema.safeParse(read(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };
  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    await tx.attendanceReason.update({ where: { id }, data: parsed.data });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'update',
      entityType: 'AttendanceReason',
      entityId: id,
      after: parsed.data,
    });
  });
  revalidatePath('/admin/settings/attendance-reasons');
  return { ok: true };
}

export async function deleteAttendanceReasonAction(id: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    await tx.attendanceReason.delete({ where: { id } });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'delete',
      entityType: 'AttendanceReason',
      entityId: id,
    });
  });
  revalidatePath('/admin/settings/attendance-reasons');
  return { ok: true };
}
