import 'server-only';
import { z } from 'zod';
import { attendanceRecordSchema } from '@jawal/shared';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { getTeacherPersonId } from '@/lib/teacher';
import { getOrCreateAppelSession } from '@/lib/teacher-attendance';
import { notifyAbsentees } from '@/lib/attendance-notify';
import { notifyCarnetEntries } from '@/lib/carnet-notify';
import { categoryOf } from '@/lib/attendance-category';

/**
 * Enregistrement d'une feuille d'appel par l'enseignant — cœur partagé entre le
 * portail web (server action) et l'API mobile. Les deux écrivent exactement les
 * mêmes données : records, entrées de carnet, événements Vie scolaire et
 * notifications. Dupliquer cette logique aurait garanti sa divergence.
 */

// Catégorie d'appel → catégorie d'événement Vie Scolaire (file à traiter).
const EVENT_CATEGORY: Record<string, 'ABSENCE' | 'RETARD' | 'EXCLUSION'> = {
  ABSENT: 'ABSENCE',
  LATE: 'RETARD',
  EXCLUSION: 'EXCLUSION',
};

// Record enrichi : présence + obs./encouragements (→ carnet de correspondance).
const recordSchema = attendanceRecordSchema.extend({
  observation: z.string().max(2000).nullable().optional(),
  observationVisible: z.boolean().optional().default(true),
  encouragement: z.string().max(2000).nullable().optional(),
  encouragementVisible: z.boolean().optional().default(true),
});

// La session est dérivée côté serveur de (entryId, date) : pas de `sessionId` client.
export const appelPayloadSchema = z.object({
  entryId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  finalize: z.boolean().default(false),
  records: z.array(recordSchema).min(1).max(500),
});

export type AppelPayload = z.infer<typeof appelPayloadSchema>;

export type SaveAppelResult = { ok: true } | { ok: false; error: string };

/**
 * Écrit la feuille d'appel (brouillon ou validation) après contrôle de
 * l'appartenance de la séance au professeur. À la validation : verrouille la
 * session, alimente la file Vie scolaire et notifie les parents (best-effort).
 */
export async function saveTeacherAppel(
  tenantId: string,
  userId: string,
  payload: AppelPayload,
): Promise<SaveAppelResult> {
  try {
    const carnetIds: string[] = [];
    const sessionId = await withTenant(tenantId, async (tx) => {
      const teacherId = await getTeacherPersonId(tx, userId);
      if (!teacherId) throw new Error('Profil enseignant introuvable.');

      // Crée la session à l'enregistrement (pas à l'ouverture) ; vérifie l'appartenance.
      const sess = await getOrCreateAppelSession(tx, tenantId, teacherId, payload.entryId, payload.date);
      if (!sess) throw new Error('Séance non autorisée.');
      if (sess.finalizedAt) throw new Error('Appel déjà validé — déverrouillez pour modifier.');

      for (const rec of payload.records) {
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
      for (const rec of payload.records) {
        // Une observation sur un élève absent/en retard/exclu est RETENUE :
        // elle n'est transmise au parent qu'après traitement Vie scolaire.
        // Hors absence/retard/exclusion → transmise selon le choix du prof.
        const isVsEvent = !!EVENT_CATEGORY[categoryOf(rec)];
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
          const held = isVsEvent && visible; // retenue jusqu'à la confirmation VS
          const created = await tx.carnetEntry.create({
            data: {
              tenantId,
              studentId: rec.studentId,
              type,
              content,
              classId: sessRow.classId,
              attendanceSessionId: sess.sessionId,
              occurredAt: sessRow.date,
              authorUserId: userId,
              authorName,
              authorRole: 'teacher',
              visibleToParents: held ? false : visible,
              heldForReview: held,
            },
          });
          if (visible && !held) carnetIds.push(created.id);
        }
      }

      if (payload.finalize) {
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
        userId,
        action: payload.finalize ? 'finalize' : 'save',
        entityType: 'AttendanceSession',
        entityId: sess.sessionId,
        after: { source: 'teacher', count: payload.records.length },
      });
      return sess.sessionId;
    });

    if (payload.finalize) await notifyAbsentees(tenantId, sessionId);
    // Notifie les parents des observations/encouragements publiés.
    await notifyCarnetEntries(tenantId, carnetIds);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
