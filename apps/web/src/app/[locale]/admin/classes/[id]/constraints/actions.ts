'use server';

import { revalidatePath } from 'next/cache';
import {
  CLASS_TIMETABLE_CONSTRAINTS_DEFAULTS,
  classTimetableConstraintsSchema,
  type ClassDayKey,
} from '@jawal/shared';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';

type Result = { ok: true } | { ok: false; error: string };

const DAY_KEYS: ClassDayKey[] = [
  'MON',
  'TUE',
  'WED',
  'THU',
  'FRI',
  'SAT',
  'SUN',
];

export async function upsertClassTimetableConstraintsAction(
  classId: string,
  formData: FormData,
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const maxRaw = formData.get('maxHoursPerDay');
  const minRaw = formData.get('minHoursPerDay');

  const forbiddenDays: ClassDayKey[] = [];
  for (const d of DAY_KEYS) {
    if (formData.get(`forbiddenDay_${d}`) === 'on') forbiddenDays.push(d);
  }

  // Plages interdites : encodage `forbiddenSlot_<day>` valeurs multiples
  const forbiddenSlots: Array<{ day: ClassDayKey; slotId: string }> = [];
  for (const d of DAY_KEYS) {
    const values = formData.getAll(`forbiddenSlot_${d}`);
    for (const v of values) {
      const s = String(v);
      if (s) forbiddenSlots.push({ day: d, slotId: s });
    }
  }

  const parsed = classTimetableConstraintsSchema.safeParse({
    maxHoursPerDay: maxRaw,
    minHoursPerDay: minRaw,
    forbiddenDays,
    forbiddenSlots,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };
  }

  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    const cls = await tx.class.findUniqueOrThrow({ where: { id: classId } });
    const metadata = (cls.metadata as Record<string, unknown>) ?? {};
    const newMetadata = { ...metadata, timetableConstraints: parsed.data };
    await tx.class.update({
      where: { id: classId },
      data: { metadata: newMetadata as object },
    });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'update',
      entityType: 'ClassTimetableConstraints',
      entityId: classId,
      after: parsed.data,
    });
  });

  revalidatePath(`/admin/classes/${classId}/constraints`);
  revalidatePath(`/admin/classes/${classId}/timetable`);
  revalidatePath('/admin/timetable/generate');
  return { ok: true };
}

export async function resetClassTimetableConstraintsAction(
  classId: string,
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    const cls = await tx.class.findUniqueOrThrow({ where: { id: classId } });
    const metadata = (cls.metadata as Record<string, unknown>) ?? {};
    const { timetableConstraints: _t, ...rest } = metadata;
    await tx.class.update({
      where: { id: classId },
      data: { metadata: rest as object },
    });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'reset',
      entityType: 'ClassTimetableConstraints',
      entityId: classId,
      after: CLASS_TIMETABLE_CONSTRAINTS_DEFAULTS,
    });
  });

  revalidatePath(`/admin/classes/${classId}/constraints`);
  revalidatePath(`/admin/classes/${classId}/timetable`);
  return { ok: true };
}
