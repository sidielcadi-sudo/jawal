'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import {
  hoursBetween,
  isOvertimeReason,
  isReplacementReason,
  sourceOfReason,
} from '@/lib/overtime-hse';

type Result = { ok: true } | { ok: false; error: string } | { ok: true; created: number };

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

/** Lecture et contrôle d'une déclaration, communs à la création et à la modification. */
function readDeclaration(fd: FormData) {
  const personId = str(fd, 'personId');
  const date = str(fd, 'date');
  const startTime = str(fd, 'startTime');
  const endTime = str(fd, 'endTime');
  const reason = str(fd, 'reason');
  const classId = str(fd, 'classId') ?? null;
  const replacedPersonId = str(fd, 'replacedPersonId') ?? null;

  if (!personId || !date || !startTime || !endTime || !reason) {
    return { ok: false as const, error: 'Champs requis manquants.' };
  }
  if (!isOvertimeReason(reason)) return { ok: false as const, error: 'Motif inconnu.' };
  const hours = hoursBetween(startTime, endTime);
  if (hours === null) return { ok: false as const, error: 'Horaire incohérent : la fin doit suivre le début.' };
  if (replacedPersonId && replacedPersonId === personId) {
    return { ok: false as const, error: 'Un enseignant ne peut pas se remplacer lui-même.' };
  }
  return {
    ok: true as const,
    data: {
      personId,
      date: new Date(`${date}T00:00:00.000Z`),
      hours,
      source: sourceOfReason(reason),
      reason,
      classId,
      startTime,
      endTime,
      // Le professeur remplacé n'a de sens que pour un remplacement.
      replacedPersonId: isReplacementReason(reason) ? replacedPersonId : null,
    },
  };
}

/**
 * Déclaration manuelle d'heures supplémentaires.
 *
 * La durée se déduit de l'horaire (créneau de l'emploi du temps ou horaire
 * libre) plutôt que d'une saisie à part : les deux ne peuvent pas diverger. La
 * source comptable se déduit du motif.
 */
export async function createOvertimeAction(fd: FormData): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const parsed = readDeclaration(fd);
  if (!parsed.ok) return parsed;

  await withTenant(s.user.tenantId, async (tx) => {
    const created = await tx.overtimeEntry.create({
      data: { tenantId: s.user.tenantId, ...parsed.data, status: 'DECLARED', createdByUserId: s.user.id },
    });
    await logAudit(tx, {
      tenantId: s.user.tenantId,
      userId: s.user.id,
      action: 'create',
      entityType: 'OvertimeEntry',
      entityId: created.id,
      after: { personId: parsed.data.personId, hours: parsed.data.hours, reason: parsed.data.reason },
    });
  });
  revalidatePath('/admin/overtime');
  return { ok: true };
}

/**
 * Modifie une déclaration soumise, tant qu'elle n'est pas encore validée par
 * les RH. Au-delà, elle est engagée dans le circuit : on la rejette et on en
 * déclare une nouvelle.
 */
export async function updateOvertimeAction(id: string, fd: FormData): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const parsed = readDeclaration(fd);
  if (!parsed.ok) return parsed;
  const tenantId = s.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const current = await tx.overtimeEntry.findUnique({
        where: { id },
        select: { status: true, personId: true, hours: true, reason: true, date: true },
      });
      if (!current) throw new Error('Déclaration introuvable.');
      if (current.status !== 'DECLARED') {
        throw new Error('Déclaration déjà validée : elle ne peut plus être modifiée.');
      }
      await tx.overtimeEntry.update({ where: { id }, data: parsed.data });
      await logAudit(tx, {
        tenantId,
        userId: s.user.id,
        action: 'update',
        entityType: 'OvertimeEntry',
        entityId: id,
        before: { personId: current.personId, hours: current.hours, reason: current.reason },
        after: { personId: parsed.data.personId, hours: parsed.data.hours, reason: parsed.data.reason },
      });
    });
    revalidatePath('/admin/overtime');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
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
          // L'horaire, la classe et le remplacé sont connus : on les garde,
          // l'historique se lit alors comme une déclaration manuelle.
          startTime: o.entry.slot.startTime,
          endTime: o.entry.slot.endTime,
          classId: o.entry.classId,
          replacedPersonId: o.entry.teacherId,
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
