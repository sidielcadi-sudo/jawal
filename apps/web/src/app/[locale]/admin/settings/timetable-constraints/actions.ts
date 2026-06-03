'use server';

import { revalidatePath } from 'next/cache';
import {
  balanceDailyLoadConfigSchema,
  maxConsecutiveHoursTeacherConfigSchema,
  maxHoursPerDayTeacherConfigSchema,
  maxSameSubjectPerDayConfigSchema,
  minimizeRoomChangesConfigSchema,
  noGapsConfigSchema,
  requireSubjectRoomTypeConfigSchema,
  requiresConsecutiveSubjectsConfigSchema,
  teacherLunchBreakConfigSchema,
  TIMETABLE_CONSTRAINT_DEFAULTS,
  timetableConstraintKindSchema,
  type TimetableConstraintKindInput,
} from '@jawal/shared';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';

type Result = { ok: true } | { ok: false; error: string };

function parseConfig(
  kind: TimetableConstraintKindInput,
  raw: Record<string, unknown>,
): { ok: true; config: Record<string, unknown> } | { ok: false; error: string } {
  switch (kind) {
    case 'MAX_SAME_SUBJECT_PER_DAY': {
      const r = maxSameSubjectPerDayConfigSchema.safeParse(raw);
      if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? 'Invalide' };
      return { ok: true, config: r.data };
    }
    case 'NO_GAPS': {
      const r = noGapsConfigSchema.safeParse(raw);
      if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? 'Invalide' };
      return { ok: true, config: r.data };
    }
    case 'REQUIRES_CONSECUTIVE_SUBJECTS': {
      const r = requiresConsecutiveSubjectsConfigSchema.safeParse(raw);
      if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? 'Invalide' };
      return { ok: true, config: r.data };
    }
    case 'MAX_HOURS_PER_DAY_TEACHER': {
      const r = maxHoursPerDayTeacherConfigSchema.safeParse(raw);
      if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? 'Invalide' };
      return { ok: true, config: r.data };
    }
    case 'MAX_CONSECUTIVE_HOURS_TEACHER': {
      const r = maxConsecutiveHoursTeacherConfigSchema.safeParse(raw);
      if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? 'Invalide' };
      return { ok: true, config: r.data };
    }
    case 'TEACHER_LUNCH_BREAK': {
      const r = teacherLunchBreakConfigSchema.safeParse(raw);
      if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? 'Invalide' };
      return { ok: true, config: r.data };
    }
    case 'REQUIRE_SUBJECT_ROOM_TYPE': {
      const r = requireSubjectRoomTypeConfigSchema.safeParse(raw);
      if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? 'Invalide' };
      return { ok: true, config: r.data };
    }
    case 'MINIMIZE_ROOM_CHANGES': {
      const r = minimizeRoomChangesConfigSchema.safeParse(raw);
      if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? 'Invalide' };
      return { ok: true, config: r.data };
    }
    case 'BALANCE_DAILY_LOAD': {
      const r = balanceDailyLoadConfigSchema.safeParse(raw);
      if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? 'Invalide' };
      return { ok: true, config: r.data };
    }
  }
}

export async function upsertConstraintAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const kindRaw = String(formData.get('kind') ?? '');
  const kindParse = timetableConstraintKindSchema.safeParse(kindRaw);
  if (!kindParse.success) return { ok: false, error: 'Type de contrainte inconnu.' };
  const kind = kindParse.data;

  const enabled = formData.get('enabled') === 'on' || formData.get('enabled') === 'true';

  // Récupère les autres champs : on accepte un payload JSON dans `config` ou
  // des champs individuels max=…, weight=…, subjectIds[]=…
  const configRaw: Record<string, unknown> = {};
  const payload = formData.get('config');
  if (typeof payload === 'string' && payload.trim()) {
    try {
      Object.assign(configRaw, JSON.parse(payload));
    } catch {
      return { ok: false, error: 'JSON config invalide.' };
    }
  } else {
    // Fallback : champs individuels
    const max = formData.get('max');
    const weight = formData.get('weight');
    const subjectIds = formData.getAll('subjectIds');
    const from = formData.get('from');
    const to = formData.get('to');
    if (max !== null) configRaw.max = max;
    if (weight !== null) configRaw.weight = weight;
    if (subjectIds.length > 0)
      configRaw.subjectIds = subjectIds.map((s) => String(s)).filter(Boolean);
    if (typeof from === 'string' && from) configRaw.from = from;
    if (typeof to === 'string' && to) configRaw.to = to;
  }

  const parsed = parseConfig(kind, configRaw);
  if (!parsed.ok) return parsed;

  const tenantId = session.user.tenantId;

  await withTenant(tenantId, async (tx) => {
    await tx.timetableConstraint.upsert({
      where: { tenantId_kind: { tenantId, kind } },
      update: { enabled, config: parsed.config as object },
      create: {
        tenantId,
        kind,
        enabled,
        config: parsed.config as object,
      },
    });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'upsert',
      entityType: 'TimetableConstraint',
      entityId: kind,
      after: { enabled, config: parsed.config },
    });
  });

  revalidatePath('/admin/settings/timetable-constraints');
  return { ok: true };
}

export async function resetConstraintAction(
  kind: TimetableConstraintKindInput,
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const defaults = TIMETABLE_CONSTRAINT_DEFAULTS[kind];
  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    await tx.timetableConstraint.upsert({
      where: { tenantId_kind: { tenantId, kind } },
      update: { enabled: false, config: defaults as object },
      create: { tenantId, kind, enabled: false, config: defaults as object },
    });
  });
  revalidatePath('/admin/settings/timetable-constraints');
  return { ok: true };
}
