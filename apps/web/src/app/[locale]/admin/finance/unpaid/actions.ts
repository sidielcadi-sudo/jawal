'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { notifyPaymentReminder } from '@/lib/unpaid-reminder-notify';

type Result = { ok: true } | { ok: false; error: string };

const schema = z.object({
  studentId: z.string().uuid(),
  note: z.string().trim().min(1).max(2000),
});

/**
 * Enregistre **et envoie** une relance de paiement à la famille d'un élève.
 *
 * L'enregistrement seul ne suffisait pas : la relance restait dans l'historique
 * sans jamais parvenir aux parents.
 */
export async function createReminderAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('finance.write');
  const parsed = schema.safeParse({
    studentId: formData.get('studentId'),
    note: formData.get('note'),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };
  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    const r = await tx.paymentReminder.create({
      data: {
        tenantId,
        studentId: parsed.data.studentId,
        note: parsed.data.note,
        createdByUserId: session.user.id,
      },
    });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'create',
      entityType: 'PaymentReminder',
      entityId: r.id,
      after: { studentId: parsed.data.studentId },
    });
  });
  // Hors transaction : un envoi qui échoue ne doit pas annuler une relance
  // déjà consignée dans l'historique.
  await notifyPaymentReminder(tenantId, parsed.data.studentId, parsed.data.note);
  revalidatePath('/admin/finance/unpaid');
  return { ok: true };
}
