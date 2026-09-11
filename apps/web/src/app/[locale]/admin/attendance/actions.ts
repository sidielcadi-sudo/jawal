'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { notifyOneAbsence } from '@/lib/attendance-notify';

export type NotifyResult = { ok: true } | { ok: false; error: string };

/**
 * Renvoie l'avis d'absence aux contacts d'un élève, depuis le tableau de bord.
 *
 * L'avis automatique part au moment de l'appel ; il manque quand l'absence est
 * saisie après coup ou que la fiche n'avait pas d'adresse. Ce bouton rattrape
 * ces cas sans obliger à rouvrir la feuille d'appel. Chaque envoi laisse une
 * trace dans `notification_logs`, qui est ce que lit la colonne
 * « Parent informé ».
 */
export async function notifyParentAction(recordId: string): Promise<NotifyResult> {
  await requirePermission('attendance.write');
  const session = (await auth())!;

  const res = await notifyOneAbsence(session.user.tenantId, recordId);
  if (!res.ok) {
    const error =
      res.reason === 'no-recipient'
        ? 'no-recipient'
        : res.reason === 'not-found'
          ? 'not-found'
          : 'send-failed';
    return { ok: false, error };
  }

  revalidatePath('/[locale]/admin/attendance', 'page');
  return { ok: true };
}
