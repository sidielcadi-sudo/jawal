'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { attendanceRecordSchema } from '@jawal/shared';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { getTeacherPersonId } from '@/lib/teacher';
import { teacherOwnsEntry, getOrCreateAppelSession } from '@/lib/teacher-attendance';
import { notifyAbsentees } from '@/lib/attendance-notify';
import { notifyCarnetEntries } from '@/lib/carnet-notify';
import { categoryOf } from '@/lib/attendance-category';

// Catégorie d'appel → catégorie d'événement Vie Scolaire (file à traiter).
const EVENT_CATEGORY: Record<string, 'ABSENCE' | 'RETARD' | 'EXCLUSION'> = {
  ABSENT: 'ABSENCE',
  LATE: 'RETARD',
  EXCLUSION: 'EXCLUSION',
};

type Result = { ok: true } | { ok: false; error: string };

// Record enrichi : présence + obs./encouragements (→ carnet de correspondance).
const recordSchema = attendanceRecordSchema.extend({
  observation: z.string().max(2000).nullable().optional(),
  observationVisible: z.boolean().optional().default(true),
  encouragement: z.string().max(2000).nullable().optional(),
  encouragementVisible: z.boolean().optional().default(true),
});

// La session est dérivée côté serveur de (entryId, date) : pas de `sessionId` client.
const payloadSchema = z.object({
  entryId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  finalize: z.boolean().default(false),
  records: z.array(recordSchema).min(1).max(500),
});

/**
 * Enregistre la feuille d'appel d'une séance par l'enseignant (brouillon ou
 * validation). Contrôle l'appartenance de la séance au prof. À la validation :
 * verrouille la session et notifie les parents des absents (best-effort).
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
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: `Données invalides${first ? ` (${first.path.join('.')})` : ''}.` };
  }

  const tenantId = sessionAuth.user.tenantId;
  try {
    const carnetIds: string[] = [];
    const sessionId = await withTenant(tenantId, async (tx) => {
      const teacherId = await getTeacherPersonId(tx, sessionAuth.user.id);
      if (!teacherId) throw new Error('Profil enseignant introuvable.');

      // Crée la session à l'enregistrement (pas à l'ouverture) ; vérifie l'appartenance.
      const sess = await getOrCreateAppelSession(
        tx,
        tenantId,
        teacherId,
        parsed.data.entryId,
        parsed.data.date,
      );
      if (!sess) throw new Error('Séance non autorisée.');
      if (sess.finalizedAt) throw new Error('Appel déjà validé — déverrouillez pour modifier.');

      for (const rec of parsed.data.records) {
        const isLate = rec.status === 'LATE';
        const data = {
          status: rec.status,
          lateMinutes: isLate ? (rec.lateMinutes ?? null) : null,
          lateReasonId: isLate ? (rec.lateReasonId ?? null) : null,
          infirmary: rec.infirmary,
          punishment: rec.punishment,
          exclusion: rec.exclusion,
          note: rec.note ?? null,
        };
        await tx.attendanceRecord.upsert({
          where: { sessionId_studentId: { sessionId: sess.sessionId, studentId: rec.studentId } },
          update: data,
          create: { tenantId, sessionId: sess.sessionId, studentId: rec.studentId, ...data },
        });
      }

      // Observations / encouragements → entrées du carnet (upsert idempotent par
      // (séance, élève, type) : on remplace l'existant et on supprime si vidé).
      const sessRow = await tx.attendanceSession.findUnique({
        where: { id: sess.sessionId },
        select: { classId: true, date: true },
      });
      const teacher = await tx.person.findUnique({
        where: { id: teacherId },
        select: { firstName: true, lastName: true },
      });
      const authorName = teacher ? `${teacher.firstName} ${teacher.lastName}` : 'Enseignant';
      for (const rec of parsed.data.records) {
        const carnet: Array<['OBSERVATION' | 'ENCOURAGEMENT', string | null | undefined, boolean]> = [
          ['OBSERVATION', rec.observation, rec.observationVisible],
          ['ENCOURAGEMENT', rec.encouragement, rec.encouragementVisible],
        ];
        for (const [type, text, visible] of carnet) {
          await tx.carnetEntry.deleteMany({
            where: { attendanceSessionId: sess.sessionId, studentId: rec.studentId, type },
          });
          const content = (text ?? '').trim();
          if (!content || !sessRow) continue;
          const created = await tx.carnetEntry.create({
            data: {
              tenantId,
              studentId: rec.studentId,
              type,
              content,
              classId: sessRow.classId,
              attendanceSessionId: sess.sessionId,
              occurredAt: sessRow.date,
              authorUserId: sessionAuth.user.id,
              authorName,
              authorRole: 'teacher',
              visibleToParents: visible,
            },
          });
          if (visible) carnetIds.push(created.id);
        }
      }

      if (parsed.data.finalize) {
        await tx.attendanceSession.update({
          where: { id: sess.sessionId },
          data: { finalizedAt: new Date() },
        });

        // Alimente la file Vie Scolaire : 1 événement PENDING par
        // absence/retard/exclusion (couche administrative, distincte du record).
        const recs = await tx.attendanceRecord.findMany({
          where: { sessionId: sess.sessionId },
          select: {
            id: true,
            studentId: true,
            status: true,
            infirmary: true,
            punishment: true,
            exclusion: true,
            lateMinutes: true,
          },
        });
        for (const r of recs) {
          const mapped = EVENT_CATEGORY[categoryOf(r)];
          if (!mapped) {
            // Record redevenu présent → retire un éventuel événement non traité.
            await tx.attendanceEvent.deleteMany({
              where: { attendanceRecordId: r.id, status: 'PENDING' },
            });
            continue;
          }
          await tx.attendanceEvent.upsert({
            where: { attendanceRecordId: r.id },
            update: { signaledCategory: mapped, lateMinutes: r.lateMinutes },
            create: {
              tenantId,
              attendanceRecordId: r.id,
              studentId: r.studentId,
              classId: sessRow!.classId,
              sessionId: sess.sessionId,
              date: sessRow!.date,
              signaledCategory: mapped,
              category: mapped,
              lateMinutes: r.lateMinutes,
              status: 'PENDING',
            },
          });
        }
      }

      await logAudit(tx, {
        tenantId,
        userId: sessionAuth.user.id,
        action: parsed.data.finalize ? 'finalize' : 'save',
        entityType: 'AttendanceSession',
        entityId: sess.sessionId,
        after: { source: 'teacher', count: parsed.data.records.length },
      });
      return sess.sessionId;
    });

    if (parsed.data.finalize) {
      await notifyAbsentees(tenantId, sessionId);
    }
    // Notifie les parents des observations/encouragements publiés.
    await notifyCarnetEntries(tenantId, carnetIds);
    revalidatePath(`/enseignant/appel/${parsed.data.entryId}/${parsed.data.date}`);
    revalidatePath('/enseignant/appel');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
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
