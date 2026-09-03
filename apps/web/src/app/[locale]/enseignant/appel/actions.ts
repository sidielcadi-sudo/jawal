'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { getTeacherPersonId } from '@/lib/teacher';
import { teacherOwnsEntry } from '@/lib/teacher-attendance';
import { appelPayloadSchema, saveTeacherAppel } from '@/lib/teacher-appel-save';

type Result = { ok: true } | { ok: false; error: string };

/**
 * Enregistre la feuille d'appel d'une séance par l'enseignant (brouillon ou
 * validation).
 *
 * L'écriture vit dans `lib/teacher-appel-save`, partagée avec l'API mobile :
 * cette action n'en est que l'enveloppe web (session, permission,
 * revalidation). Dupliquer la logique aurait garanti sa divergence — carnet,
 * événements Vie scolaire et notifications doivent rester identiques quel que
 * soit le support depuis lequel le prof fait l'appel.
 */
export async function saveTeacherAppelAction(formData: FormData): Promise<Result> {
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
  const parsed = appelPayloadSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: `Données invalides${first ? ` (${first.path.join('.')})` : ''}.` };
  }

  const res = await saveTeacherAppel(sessionAuth.user.tenantId, sessionAuth.user.id, parsed.data);
  if (!res.ok) return res;

  revalidatePath(`/enseignant/appel/${parsed.data.entryId}/${parsed.data.date}`);
  revalidatePath('/enseignant/appel');
  return { ok: true };
}

/** Déverrouille une feuille d'appel validée (réservé au prof propriétaire). */
export async function reopenTeacherAppelAction(
  sessionId: string,
  entryId: string,
): Promise<Result> {
  const sessionAuth = await auth();
  if (!sessionAuth?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('attendance.write');
  const tenantId = sessionAuth.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const teacherId = await getTeacherPersonId(tx, sessionAuth.user.id);
      if (!teacherId) throw new Error('Profil enseignant introuvable.');
      if (!(await teacherOwnsEntry(tx, teacherId, entryId)))
        throw new Error('Séance non autorisée.');
      const sess = await tx.attendanceSession.findUnique({
        where: { id: sessionId },
        select: { vsLocked: true },
      });
      if (sess?.vsLocked)
        throw new Error('Appel verrouillé par la Vie scolaire — modification impossible.');
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
    revalidatePath(`/enseignant/appel/${entryId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
