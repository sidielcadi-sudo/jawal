'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { buildInstallments } from '@/lib/fees';
import type { Prisma } from '@jawal/db';
import { TRANSPORT_LABEL } from './constants';

type Result = { ok: true } | { ok: false; error: string };

async function guard() {
  const session = await auth();
  if (!session?.user) return null;
  await requirePermission('tenants.manage');
  return session;
}
const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
};
const num = (fd: FormData, k: string) => {
  const v = str(fd, k);
  return v !== undefined ? Number(v) : undefined;
};

// ── Zones ────────────────────────────────────────────────────────────────
export async function createZoneAction(fd: FormData): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const p = z
    .object({ name: z.string().min(1).max(100), order: z.number().int().min(0).max(999).default(0), annualAmount: z.number().min(0).max(1_000_000).default(0) })
    .safeParse({ name: str(fd, 'name'), order: num(fd, 'order') ?? 0, annualAmount: num(fd, 'annualAmount') ?? 0 });
  if (!p.success) return { ok: false, error: 'Données invalides.' };
  await withTenant(s.user.tenantId, (tx) =>
    tx.transportZone.create({ data: { tenantId: s.user.tenantId, ...p.data } }),
  );
  revalidatePath('/admin/transport');
  return { ok: true };
}

export async function deleteZoneAction(id: string): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  await withTenant(s.user.tenantId, (tx) => tx.transportZone.delete({ where: { id } }));
  revalidatePath('/admin/transport');
  return { ok: true };
}

// ── Bus ──────────────────────────────────────────────────────────────────
export async function createBusAction(fd: FormData): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const number = str(fd, 'number');
  if (!number) return { ok: false, error: 'Numéro requis.' };
  await withTenant(s.user.tenantId, (tx) =>
    tx.bus.create({
      data: {
        tenantId: s.user.tenantId,
        number,
        plate: str(fd, 'plate') ?? null,
        capacity: num(fd, 'capacity') ?? 0,
        status: (str(fd, 'status') as 'EN_SERVICE' | 'PANNE' | 'REMPLACEMENT') ?? 'EN_SERVICE',
      },
    }),
  );
  revalidatePath('/admin/transport');
  return { ok: true };
}

export async function deleteBusAction(id: string): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  await withTenant(s.user.tenantId, (tx) => tx.bus.delete({ where: { id } }));
  revalidatePath('/admin/transport');
  return { ok: true };
}

// ── Lignes ───────────────────────────────────────────────────────────────
export async function createLineAction(fd: FormData): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const name = str(fd, 'name');
  if (!name) return { ok: false, error: 'Nom requis.' };
  await withTenant(s.user.tenantId, (tx) =>
    tx.transportLine.create({ data: { tenantId: s.user.tenantId, name, districts: str(fd, 'districts') ?? null } }),
  );
  revalidatePath('/admin/transport');
  return { ok: true };
}

export async function updateLineAction(fd: FormData): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const id = str(fd, 'id');
  if (!id) return { ok: false, error: 'Ligne introuvable.' };
  await withTenant(s.user.tenantId, async (tx) => {
    await tx.transportLine.update({
      where: { id },
      data: {
        name: str(fd, 'name') ?? undefined,
        districts: str(fd, 'districts') ?? null,
        busId: str(fd, 'busId') ?? null,
        driverId: str(fd, 'driverId') ?? null,
        attendantId: str(fd, 'attendantId') ?? null,
        morningDeparture: str(fd, 'morningDeparture') ?? null,
        morningArrival: str(fd, 'morningArrival') ?? null,
        eveningDeparture: str(fd, 'eveningDeparture') ?? null,
        eveningArrival: str(fd, 'eveningArrival') ?? null,
        capacity: num(fd, 'capacity') ?? 0,
        active: fd.get('active') === 'on' || fd.get('active') === 'true',
      },
    });
    await logAudit(tx, { tenantId: s.user.tenantId, userId: s.user.id, action: 'update', entityType: 'TransportLine', entityId: id });
  });
  revalidatePath(`/admin/transport`);
  revalidatePath(`/admin/transport/${id}`);
  return { ok: true };
}

export async function deleteLineAction(id: string): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  await withTenant(s.user.tenantId, (tx) => tx.transportLine.delete({ where: { id } }));
  revalidatePath('/admin/transport');
  return { ok: true };
}

// ── Arrêts ───────────────────────────────────────────────────────────────
export async function createStopAction(fd: FormData): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const lineId = str(fd, 'lineId');
  const name = str(fd, 'name');
  if (!lineId || !name) return { ok: false, error: 'Ligne et nom requis.' };
  await withTenant(s.user.tenantId, (tx) =>
    tx.transportStop.create({
      data: {
        tenantId: s.user.tenantId,
        lineId,
        name,
        address: str(fd, 'address') ?? null,
        zoneId: str(fd, 'zoneId') ?? null,
        order: num(fd, 'order') ?? 0,
        plannedTime: str(fd, 'plannedTime') ?? null,
      },
    }),
  );
  revalidatePath(`/admin/transport/${lineId}`);
  return { ok: true };
}

export async function deleteStopAction(id: string, lineId: string): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  await withTenant(s.user.tenantId, (tx) => tx.transportStop.delete({ where: { id } }));
  revalidatePath(`/admin/transport/${lineId}`);
  return { ok: true };
}

// ── Affectation des élèves + facturation par zone ──────────────────────────

/** Parse une zone de texte « Nom ; CIN » (une personne autorisée par ligne). */
function parseAuthorizedPickups(raw: string | undefined): { name: string; cin: string }[] {
  if (!raw) return [];
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [name, cin] = l.split(/[;|-]/, 2).map((x) => x.trim());
      return { name: name ?? l, cin: cin ?? '' };
    });
}

/**
 * (Re)génère la facturation transport « par zone » d'un élève (échéances ad hoc,
 * feeScheduleItemId = null, libellé préfixé `TRANSPORT_LABEL`) :
 *  - annule les échéances IMPAYÉES existantes, conserve les (partiellement) payées ;
 *  - si une zone (montant > 0) est fournie → génère `count` échéances du tarif zone.
 */
async function recomputeTransportBilling(
  tx: Prisma.TransactionClient,
  tenantId: string,
  studentId: string,
  zone: { name: string; annualAmount: unknown } | null,
  count: number,
): Promise<{ created: number; keptPaid: number; cancelled: number }> {
  const existing = await tx.installment.findMany({
    where: {
      studentId,
      feeScheduleItemId: null,
      label: { startsWith: TRANSPORT_LABEL },
      status: { not: 'CANCELLED' },
    },
    include: { payments: { select: { amount: true } } },
  });
  let keptPaid = 0;
  const toCancel: string[] = [];
  for (const i of existing) {
    const paid = i.payments.reduce((s, p) => s + Number(p.amount), 0);
    if (paid > 0) keptPaid++;
    else toCancel.push(i.id);
  }
  if (toCancel.length)
    await tx.installment.updateMany({ where: { id: { in: toCancel } }, data: { status: 'CANCELLED' } });

  let created = 0;
  const amount = zone ? Number(zone.annualAmount) : 0;
  if (zone && amount > 0 && count >= 1) {
    const now = new Date();
    const year =
      (await tx.academicYear.findFirst({ where: { startDate: { lte: now }, endDate: { gte: now } } })) ??
      (await tx.academicYear.findFirst({ orderBy: { startDate: 'desc' } }));
    const yearStart = year?.startDate ?? new Date(Date.UTC(now.getUTCFullYear(), 8, 1));
    const drafts = buildInstallments(
      {
        id: 'transport-zone',
        label: `${TRANSPORT_LABEL} — ${zone.name}`,
        category: 'TRANSPORT',
        totalAmount: amount,
        installmentCount: count,
        installmentLocked: false,
        firstDueMonth: yearStart.getUTCMonth() + 1,
      },
      { pct: 0, count, yearStart },
    );
    for (const d of drafts) {
      await tx.installment.create({
        data: { tenantId, studentId, feeScheduleItemId: null, label: d.label, amount: d.amount, dueDate: d.dueDate, status: 'PENDING' },
      });
      created++;
    }
  }
  return { created, keptPaid, cancelled: toCancel.length };
}

export async function assignStudentAction(fd: FormData): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const tenantId = s.user.tenantId;
  const lineId = str(fd, 'lineId');
  const studentId = str(fd, 'studentId');
  if (!lineId || !studentId) return { ok: false, error: 'Élève et ligne requis.' };
  const days = fd.getAll('days').filter((d): d is string => typeof d === 'string');
  const billingCount = Math.min(24, Math.max(1, num(fd, 'billingCount') ?? 9));
  const authorizedPickups = parseAuthorizedPickups(str(fd, 'authorizedPickups'));

  try {
    return await withTenant(tenantId, async (tx): Promise<Result> => {
      const line = await tx.transportLine.findUnique({ where: { id: lineId }, select: { capacity: true } });
      if (!line) return { ok: false, error: 'Ligne introuvable.' };
      const activeCount = await tx.studentTransport.count({
        where: { lineId, status: 'ACTIVE', studentId: { not: studentId } },
      });
      if (line.capacity > 0 && activeCount >= line.capacity)
        return { ok: false, error: `Ligne pleine (capacité ${line.capacity}).` };

      const zoneId = str(fd, 'zoneId') ?? null;
      const data = {
        lineId,
        stopId: str(fd, 'stopId') ?? null,
        zoneId,
        days,
        pickupTime: str(fd, 'pickupTime') ?? null,
        dropoffTime: str(fd, 'dropoffTime') ?? null,
        exitAlone: fd.get('exitAlone') === 'on' || fd.get('exitAlone') === 'true',
        securityNotes: str(fd, 'securityNotes') ?? null,
        authorizedPickups: authorizedPickups as unknown as Prisma.InputJsonValue,
        status: 'ACTIVE' as const,
      };
      await tx.studentTransport.upsert({
        where: { studentId },
        create: { tenantId, studentId, ...data },
        update: data,
      });
      await tx.person.update({ where: { id: studentId }, data: { usesTransport: true } });
      const zone = zoneId ? await tx.transportZone.findUnique({ where: { id: zoneId }, select: { name: true, annualAmount: true } }) : null;
      const billing = await recomputeTransportBilling(tx, tenantId, studentId, zone, billingCount);
      await logAudit(tx, { tenantId, userId: s.user.id, action: 'assign_transport', entityType: 'StudentTransport', entityId: studentId, after: { lineId, zoneId, ...billing } });
      revalidatePath(`/admin/transport/${lineId}`);
      revalidatePath('/admin/finance');
      return { ok: true };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

export async function unassignStudentAction(studentId: string, lineId: string): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const tenantId = s.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      await tx.studentTransport.deleteMany({ where: { studentId } });
      await tx.person.update({ where: { id: studentId }, data: { usesTransport: false } });
      await recomputeTransportBilling(tx, tenantId, studentId, null, 0);
      await logAudit(tx, { tenantId, userId: s.user.id, action: 'unassign_transport', entityType: 'StudentTransport', entityId: studentId });
    });
    revalidatePath(`/admin/transport/${lineId}`);
    revalidatePath('/admin/finance');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
