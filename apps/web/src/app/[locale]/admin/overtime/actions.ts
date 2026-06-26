'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';

type Result = { ok: true } | { ok: false; error: string } | { ok: true; created: number };

const SOURCES = ['TEACHING_OVER_QUOTA', 'SUBSTITUTION', 'PARASCOLAIRE', 'AFTER_HOURS', 'EXAM_SUPERVISION', 'SPECIAL_EVENT'] as const;
type Source = (typeof SOURCES)[number];

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
};
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

async function guard() {
  const session = await auth();
  if (!session?.user) return null;
  await requirePermission('tenants.manage');
  return session;
}

export async function createOvertimeAction(fd: FormData): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const personId = str(fd, 'personId');
  const date = str(fd, 'date');
  const hours = Number(str(fd, 'hours'));
  const source = str(fd, 'source') as Source | undefined;
  if (!personId || !date || !hours || hours <= 0 || !source || !SOURCES.includes(source))
    return { ok: false, error: 'Champs requis manquants.' };
  await withTenant(s.user.tenantId, (tx) =>
    tx.overtimeEntry.create({
      data: {
        tenantId: s.user.tenantId,
        personId,
        date: new Date(`${date}T00:00:00.000Z`),
        hours,
        source,
        note: str(fd, 'note') ?? null,
        status: 'DECLARED',
        createdByUserId: s.user.id,
      },
    }),
  );
  revalidatePath('/admin/overtime');
  return { ok: true };
}

/** Génère les heures sup des remplacements (overrides SUBSTITUTION non encore enregistrés). */
export async function generateFromSubstitutionsAction(): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const tenantId = s.user.tenantId;
  let created = 0;
  await withTenant(tenantId, async (tx) => {
    const overrides = await tx.timetableOverride.findMany({
      where: { kind: 'SUBSTITUTION', substituteTeacherId: { not: null } },
      include: { entry: { include: { slot: { select: { startTime: true, endTime: true } } } } },
    });
    const existing = new Set(
      (await tx.overtimeEntry.findMany({ where: { source: 'SUBSTITUTION', sourceRef: { not: null } }, select: { sourceRef: true } })).map((e) => e.sourceRef),
    );
    for (const o of overrides) {
      if (existing.has(o.id)) continue;
      const hours = Math.round(((toMin(o.entry.slot.endTime) - toMin(o.entry.slot.startTime)) / 60) * 100) / 100;
      if (hours <= 0) continue;
      await tx.overtimeEntry.create({
        data: {
          tenantId,
          personId: o.substituteTeacherId!,
          date: o.date,
          hours,
          source: 'SUBSTITUTION',
          sourceRef: o.id,
          note: 'Remplacement',
          status: 'DECLARED',
          createdByUserId: s.user.id,
        },
      });
      created++;
    }
    await logAudit(tx, { tenantId, userId: s.user.id, action: 'generate_overtime', entityType: 'OvertimeEntry', entityId: 'batch', after: { created } });
  });
  revalidatePath('/admin/overtime');
  return { ok: true, created };
}

export async function advanceOvertimeAction(
  id: string,
  action: 'validate' | 'approve' | 'process' | 'reject',
): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const tenantId = s.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const e = await tx.overtimeEntry.findUnique({ where: { id }, select: { status: true } });
      if (!e) throw new Error('Introuvable.');
      const data: Record<string, unknown> = {};
      if (action === 'reject') {
        data.status = 'REJECTED';
      } else if (action === 'validate') {
        if (e.status !== 'DECLARED') throw new Error('Étape invalide.');
        data.status = 'RH_VALIDATED';
        data.rhByUserId = s.user.id;
      } else if (action === 'approve') {
        if (e.status !== 'RH_VALIDATED') throw new Error('Étape invalide.');
        data.status = 'DIRECTION_APPROVED';
        data.directionByUserId = s.user.id;
      } else if (action === 'process') {
        if (e.status !== 'DIRECTION_APPROVED') throw new Error('Étape invalide.');
        data.status = 'PROCESSED';
        data.processedByUserId = s.user.id;
      }
      await tx.overtimeEntry.update({ where: { id }, data });
      await logAudit(tx, { tenantId, userId: s.user.id, action: `overtime_${action}`, entityType: 'OvertimeEntry', entityId: id });
    });
    revalidatePath('/admin/overtime');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

export async function deleteOvertimeAction(id: string): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  await withTenant(s.user.tenantId, (tx) => tx.overtimeEntry.delete({ where: { id } }));
  revalidatePath('/admin/overtime');
  return { ok: true };
}
