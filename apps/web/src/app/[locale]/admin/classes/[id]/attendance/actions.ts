'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { adminAppelPayloadSchema, saveAdminAppel } from '@/lib/teacher-appel-save';

type Result = { ok: true } | { ok: false; error: string };

/**
 * Enregistre la feuille d'appel d'une classe depuis le portail admin
 * (brouillon ou validation).
 *
 * L'écriture vit dans `lib/teacher-appel-save`, partagée avec le portail
 * enseignant et l'API mobile : catégories, carnet de correspondance, file Vie
 * scolaire et notifications sont identiques quel que soit l'auteur de l'appel.
 * La session est dérivée côté serveur de (classe, date, créneau).
 */
export async function saveAdminAppelAction(formData: FormData): Promise<Result> {
  const sessionAuth = await auth();
  if (!sessionAuth?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('attendance.write');

  const raw = formData.get('payload');
  if (typeof raw !== 'string') return { ok: false, error: 'Payload manquant' };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'JSON invalide' };
  }
  const parsed = adminAppelPayloadSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: `Données invalides${first ? ` (${first.path.join('.')})` : ''}.` };
  }

  const res = await saveAdminAppel(
    sessionAuth.user.tenantId,
    sessionAuth.user.id,
    sessionAuth.user.email ?? null,
    parsed.data,
  );
  if (!res.ok) return res;

  revalidatePath(`/admin/classes/${parsed.data.classId}/attendance`);
  return { ok: true };
}

/** Déverrouille une feuille d'appel validée (Vie scolaire / direction). */
export async function reopenSessionAction(sessionId: string): Promise<Result> {
  const sessionAuth = await auth();
  if (!sessionAuth?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('attendance.write');

  const tenantId = sessionAuth.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      await tx.attendanceSession.update({
        where: { id: sessionId },
        data: { finalizedAt: null },
      });
      await logAudit(tx, {
        tenantId,
        userId: sessionAuth.user.id,
        action: 'reopen',
        entityType: 'AttendanceSession',
        entityId: sessionId,
      });
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
