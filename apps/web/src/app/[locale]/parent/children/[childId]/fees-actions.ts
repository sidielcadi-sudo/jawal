'use server';

import { revalidatePath } from 'next/cache';
import { exceptionalFeeConsentSchema } from '@jawal/shared';
import { auth } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { parentCanAccessChild } from '@/lib/parent';
import { applyConsent } from '@/lib/exceptional-fees';

type Result = { ok: true } | { ok: false; error: string };

/**
 * Décision de consentement d'un PARENT sur un frais exceptionnel optionnel.
 * ACCEPT → la ligne est facturée (entre dans « À payer »). REFUSE → rien facturé.
 */
export async function setFeeConsentAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  const tenantId = session.user.tenantId;

  const parsed = exceptionalFeeConsentSchema.safeParse({
    assignmentId: formData.get('assignmentId'),
    decision: formData.get('decision'),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  try {
    await withTenant(tenantId, async (tx) => {
      const a = await tx.exceptionalFeeAssignment.findUnique({
        where: { id: parsed.data.assignmentId },
        include: { exceptionalFee: true },
      });
      if (!a) throw new Error('Affectation introuvable.');
      if (!(await parentCanAccessChild(tx, session.user.id, a.studentId)))
        throw new Error('Accès refusé.');
      if (a.exceptionalFee.mandatory) throw new Error('Frais obligatoire — non modifiable.');
      if (a.exceptionalFee.status !== 'PUBLISHED') throw new Error('Frais non disponible.');

      await applyConsent(
        tx,
        tenantId,
        { id: a.id, studentId: a.studentId, installmentId: a.installmentId },
        {
          id: a.exceptionalFee.id,
          label: a.exceptionalFee.label,
          amount: a.exceptionalFee.amount,
          dueDate: a.exceptionalFee.dueDate,
          activityDate: a.exceptionalFee.activityDate,
          mandatory: a.exceptionalFee.mandatory,
        },
        parsed.data.decision,
        session.user.id,
      );

      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: parsed.data.decision === 'ACCEPT' ? 'accept' : 'refuse',
        entityType: 'ExceptionalFeeAssignment',
        entityId: a.id,
        after: { decision: parsed.data.decision },
      });
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }

  revalidatePath('/parent');
  return { ok: true };
}
