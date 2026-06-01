'use server';

import { revalidatePath } from 'next/cache';
import {
  TIMETABLE_SETTINGS_DEFAULTS,
  readTimetableSettings,
  timetableSettingsSchema,
  type DayKey,
  type DayMode,
} from '@jawal/shared';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';

type Result = { ok: true } | { ok: false; error: string };

const DAY_KEYS: DayKey[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

function parseSettingsFromForm(formData: FormData) {
  const days: Record<DayKey, DayMode> = {
    ...(TIMETABLE_SETTINGS_DEFAULTS.days as Record<DayKey, DayMode>),
  };
  for (const k of DAY_KEYS) {
    const v = formData.get(`day_${k}`);
    if (typeof v === 'string') {
      const mode = v as DayMode;
      if (
        mode === 'FULL' ||
        mode === 'MORNING_ONLY' ||
        mode === 'AFTERNOON_ONLY' ||
        mode === 'OFF'
      ) {
        days[k] = mode;
      }
    }
  }

  const morningEndsAt =
    (formData.get('morningEndsAt') as string) ??
    TIMETABLE_SETTINGS_DEFAULTS.morningEndsAt;
  const afternoonStartsAt =
    (formData.get('afternoonStartsAt') as string) ??
    TIMETABLE_SETTINGS_DEFAULTS.afternoonStartsAt;
  const lunchEnabled = formData.get('lunchEnabled') === 'on';
  const lunchFrom =
    (formData.get('lunchFrom') as string) ??
    TIMETABLE_SETTINGS_DEFAULTS.lunchBreak.from;
  const lunchTo =
    (formData.get('lunchTo') as string) ??
    TIMETABLE_SETTINGS_DEFAULTS.lunchBreak.to;

  return timetableSettingsSchema.safeParse({
    days,
    morningEndsAt,
    afternoonStartsAt,
    lunchBreak: { enabled: lunchEnabled, from: lunchFrom, to: lunchTo },
  });
}

/** Upsert des défauts établissement (Tenant.settings.timetable). */
export async function upsertTimetableSettingsAction(
  formData: FormData,
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const parsed = parseSettingsFromForm(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };
  }

  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const settings = (tenant.settings as Record<string, unknown>) ?? {};
    const newSettings = { ...settings, timetable: parsed.data };
    await tx.tenant.update({
      where: { id: tenantId },
      data: { settings: newSettings as object },
    });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'update',
      entityType: 'TenantTimetableSettings',
      entityId: tenantId,
      after: parsed.data,
    });
  });

  revalidatePath('/admin/settings/timetable-settings');
  revalidatePath('/admin/timetable/generate');
  return { ok: true };
}

/** Upsert d'un override sur un cycle précis. */
export async function upsertCycleTimetableSettingsAction(
  cycleId: string,
  formData: FormData,
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const parsed = parseSettingsFromForm(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };
  }

  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    const cycle = await tx.cycle.findUniqueOrThrow({ where: { id: cycleId } });
    const settings = (cycle.settings as Record<string, unknown>) ?? {};
    const newSettings = { ...settings, timetable: parsed.data };
    await tx.cycle.update({
      where: { id: cycleId },
      data: { settings: newSettings as object },
    });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'update',
      entityType: 'CycleTimetableSettings',
      entityId: cycleId,
      after: parsed.data,
    });
  });

  revalidatePath('/admin/settings/timetable-settings');
  revalidatePath('/admin/timetable/generate');
  return { ok: true };
}

/** Retire l'override d'un cycle (il hérite à nouveau des défauts). */
export async function resetCycleTimetableSettingsAction(
  cycleId: string,
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    const cycle = await tx.cycle.findUniqueOrThrow({ where: { id: cycleId } });
    const settings = (cycle.settings as Record<string, unknown>) ?? {};
    // Retire la clé "timetable" pour revenir à l'héritage
    const { timetable: _t, ...rest } = settings;
    await tx.cycle.update({
      where: { id: cycleId },
      data: { settings: rest as object },
    });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'reset',
      entityType: 'CycleTimetableSettings',
      entityId: cycleId,
    });
  });

  revalidatePath('/admin/settings/timetable-settings');
  revalidatePath('/admin/timetable/generate');
  return { ok: true };
}

export async function getTimetableSettings() {
  const session = await auth();
  if (!session?.user) return null;
  const tenant = await withTenant(session.user.tenantId, (tx) =>
    tx.tenant.findUniqueOrThrow({ where: { id: session.user.tenantId } }),
  );
  return readTimetableSettings(tenant.settings);
}
