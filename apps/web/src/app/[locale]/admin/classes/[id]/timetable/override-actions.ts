'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { timetableOverrideCreateSchema } from '@jawal/shared';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';

type Result = { ok: true } | { ok: false; error: string };

function get(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v.trim() : '';
}

export async function createOverrideAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const parsed = timetableOverrideCreateSchema.safeParse({
    entryId: get(formData, 'entryId'),
    date: get(formData, 'date'),
    kind: get(formData, 'kind'),
    substituteTeacherId: get(formData, 'substituteTeacherId') || undefined,
    substituteRoomId: get(formData, 'substituteRoomId') || undefined,
    substituteSubjectId: get(formData, 'substituteSubjectId') || undefined,
    reason: get(formData, 'reason') || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Données invalides.' };
  }

  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const entry = await tx.timetableEntry.findUnique({ where: { id: parsed.data.entryId } });
      if (!entry) throw new Error('Séance introuvable.');

      const date = new Date(parsed.data.date);
      date.setUTCHours(0, 0, 0, 0);

      await tx.timetableOverride.upsert({
        where: { entryId_date: { entryId: parsed.data.entryId, date } },
        update: {
          kind: parsed.data.kind,
          substituteTeacherId:
            parsed.data.kind === 'SUBSTITUTION' ? parsed.data.substituteTeacherId ?? null : null,
          substituteRoomId:
            parsed.data.kind === 'SUBSTITUTION' ? parsed.data.substituteRoomId ?? null : null,
          substituteSubjectId:
            parsed.data.kind === 'SUBSTITUTION' ? parsed.data.substituteSubjectId ?? null : null,
          reason: parsed.data.reason ?? null,
        },
        create: {
          tenantId,
          entryId: parsed.data.entryId,
          date,
          kind: parsed.data.kind,
          substituteTeacherId:
            parsed.data.kind === 'SUBSTITUTION' ? parsed.data.substituteTeacherId ?? null : null,
          substituteRoomId:
            parsed.data.kind === 'SUBSTITUTION' ? parsed.data.substituteRoomId ?? null : null,
          substituteSubjectId:
            parsed.data.kind === 'SUBSTITUTION' ? parsed.data.substituteSubjectId ?? null : null,
          reason: parsed.data.reason ?? null,
          createdByUserId: session.user.id,
        },
      });

      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'override',
        entityType: 'TimetableEntry',
        entityId: parsed.data.entryId,
        after: { date: parsed.data.date, kind: parsed.data.kind },
      });
    });
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }

  revalidatePath(`/admin/classes/${get(formData, 'classId')}/timetable`);
  return { ok: true };
}

export async function deleteOverrideAction(id: string, classId: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      await tx.timetableOverride.delete({ where: { id } });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'delete',
        entityType: 'TimetableOverride',
        entityId: id,
      });
    });
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
  revalidatePath(`/admin/classes/${classId}/timetable`);
  return { ok: true };
}
