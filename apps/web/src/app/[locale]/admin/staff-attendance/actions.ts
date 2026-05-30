'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { staffAttendanceBulkSaveSchema } from '@jawal/shared';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { computeStaffDeduction } from '@/lib/staff-attendance-deduction';

type Result = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

function flatten<T>(parsed: z.SafeParseError<T>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join('.');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * Sauvegarde le pointage d'une journée pour le personnel concerné.
 * Upsert sur (personId, date). Recalcule deductionAmount à partir du salaire
 * brut sauf si la ligne existante est verrouillée (deductionLocked).
 */
export async function saveStaffAttendanceAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const raw = formData.get('payload');
  if (typeof raw !== 'string') return { ok: false, error: 'Payload manquant' };
  let parsedJson;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'JSON invalide' };
  }

  const parsed = staffAttendanceBulkSaveSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides.', fieldErrors: flatten(parsed) };
  }

  const tenantId = session.user.tenantId;
  const dateOnly = new Date(parsed.data.date);
  dateOnly.setUTCHours(0, 0, 0, 0);

  await withTenant(tenantId, async (tx) => {
    for (const rec of parsed.data.records) {
      const person = await tx.person.findUnique({
        where: { id: rec.personId },
        select: { grossSalary: true, type: true },
      });
      if (!person) continue;
      if (person.type !== 'TEACHER' && person.type !== 'STAFF') continue;

      const existing = await tx.staffAttendance.findUnique({
        where: { personId_date: { personId: rec.personId, date: dateOnly } },
      });

      const computed = computeStaffDeduction({
        status: rec.status,
        grossSalary: person.grossSalary !== null ? Number(person.grossSalary) : null,
        lateMinutes: rec.status === 'LATE' ? (rec.lateMinutes ?? null) : null,
      });

      const data = {
        status: rec.status,
        lateMinutes: rec.status === 'LATE' ? (rec.lateMinutes ?? null) : null,
        note: rec.note ?? null,
        // On préserve le montant si l'opérateur l'a manuellement verrouillé
        deductionAmount: existing?.deductionLocked
          ? existing.deductionAmount
          : computed.amount,
        recordedByUserId: session.user.id,
      };

      if (existing) {
        await tx.staffAttendance.update({
          where: { id: existing.id },
          data,
        });
      } else {
        await tx.staffAttendance.create({
          data: {
            tenantId,
            personId: rec.personId,
            date: dateOnly,
            ...data,
          },
        });
      }
    }

    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'save',
      entityType: 'StaffAttendance',
      entityId: parsed.data.date,
      after: {
        date: parsed.data.date,
        count: parsed.data.records.length,
        summary: {
          present: parsed.data.records.filter((r) => r.status === 'PRESENT').length,
          absent: parsed.data.records.filter((r) => r.status === 'ABSENT').length,
          late: parsed.data.records.filter((r) => r.status === 'LATE').length,
          excused: parsed.data.records.filter((r) => r.status === 'EXCUSED').length,
          leave: parsed.data.records.filter((r) => r.status === 'LEAVE').length,
        },
      },
    });
  });

  revalidatePath('/admin/staff-attendance');
  return { ok: true };
}
