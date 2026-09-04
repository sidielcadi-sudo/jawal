import 'server-only';
import { z } from 'zod';
import { attendanceRecordSchema } from '@jawal/shared';
import { logAudit } from '@/lib/audit';
import { withTenant, type Prisma } from '@/lib/db';
import { getTeacherPersonId } from '@/lib/teacher';
import { getOrCreateAppelSession, teacherOwnsEntry } from '@/lib/teacher-attendance';
import { notifyAbsentees } from '@/lib/attendance-notify';
import { notifyCarnetEntries } from '@/lib/carnet-notify';
import { categoryOf } from '@/lib/attendance-category';

type Tx = Prisma.TransactionClient;

/**
 * Enregistrement d'une feuille d'appel — cœur partagé entre le portail
 * enseignant (server action), l'API mobile et l'appel du portail admin. Tous
 * écrivent exactement les mêmes données : records, entrées de carnet,
 * événements Vie scolaire et notifications. Dupliquer cette logique aurait
 * garanti sa divergence.
 *
 * Seule la **résolution de la séance** change d'un support à l'autre : le prof
 * part d'une case d'EDT (dont on vérifie qu'elle est bien la sienne),
 * l'administration part d'une classe et d'une date.
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

export type AppelRecordInput = z.infer<typeof recordSchema>;

// La session est dérivée côté serveur de (entryId, date) : pas de `sessionId` client.
export const appelPayloadSchema = z.object({
  entryId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  finalize: z.boolean().default(false),
  records: z.array(recordSchema).min(1).max(500),
});

export type AppelPayload = z.infer<typeof appelPayloadSchema>;

export type SaveAppelResult = { ok: true } | { ok: false; error: string };

/** Séance résolue par l'appelant + identité de l'auteur des entrées de carnet. */
type ResolvedSession = {
  sessionId: string;
  finalizedAt: Date | null;
  authorName: string;
  authorRole: string;
};

/**
 * Écrit la feuille d'appel (brouillon ou validation) sur une séance déjà
 * résolue. À la validation : verrouille la session, alimente la file Vie
 * scolaire et notifie les parents (best-effort, hors transaction).
 */
async function saveAppelSheet(
  tenantId: string,
  userId: string,
  body: { finalize: boolean; records: AppelRecordInput[] },
  resolve: (tx: Tx) => Promise<ResolvedSession>,
  source: string,
): Promise<SaveAppelResult> {
  try {
    const carnetIds: string[] = [];
    const sessionId = await withTenant(tenantId, async (tx) => {
      const sess = await resolve(tx);
      if (sess.finalizedAt) throw new Error('Appel déjà validé — déverrouillez pour modifier.');

      for (const rec of body.records) {
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
      for (const rec of body.records) {
        // Une observation sur un élève absent/en retard/exclu est RETENUE :
        // elle n'est transmise au parent qu'après traitement Vie scolaire.
        // Hors absence/retard/exclusion → transmise selon le choix de l'auteur.
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
              authorName: sess.authorName,
              authorRole: sess.authorRole,
              visibleToParents: held ? false : visible,
              heldForReview: held,
            },
          });
          if (visible && !held) carnetIds.push(created.id);
        }
      }

      if (body.finalize) {
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
        action: body.finalize ? 'finalize' : 'save',
        entityType: 'AttendanceSession',
        entityId: sess.sessionId,
        after: { source, count: body.records.length },
      });
      return sess.sessionId;
    });

    if (body.finalize) await notifyAbsentees(tenantId, sessionId);
    // Notifie les parents des observations/encouragements publiés.
    await notifyCarnetEntries(tenantId, carnetIds);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/**
 * Appel fait par l'enseignant depuis une case d'EDT (portail web ou mobile).
 * La séance est créée à l'enregistrement, jamais à l'ouverture — pas de
 * brouillon fantôme au simple affichage.
 */
export async function saveTeacherAppel(
  tenantId: string,
  userId: string,
  payload: AppelPayload,
): Promise<SaveAppelResult> {
  return saveAppelSheet(
    tenantId,
    userId,
    payload,
    async (tx) => {
      const teacherId = await getTeacherPersonId(tx, userId);
      if (!teacherId) throw new Error('Profil enseignant introuvable.');
      const sess = await getOrCreateAppelSession(
        tx,
        tenantId,
        teacherId,
        payload.entryId,
        payload.date,
      );
      if (!sess) throw new Error('Séance non autorisée.');
      const teacher = await tx.person.findUnique({
        where: { id: teacherId },
        select: { firstName: true, lastName: true },
      });
      return {
        ...sess,
        authorName: teacher ? `${teacher.firstName} ${teacher.lastName}` : 'Enseignant',
        authorRole: 'teacher',
      };
    },
    'teacher',
  );
}

/**
 * Déverrouille une feuille d'appel validée par le professeur (web ou mobile).
 * Refusé si la Vie scolaire a verrouillé la séance : à ce stade l'appel est
 * une pièce administrative, seul le portail admin peut la rouvrir.
 */
export async function reopenTeacherAppel(
  tenantId: string,
  userId: string,
  sessionId: string,
  entryId: string,
): Promise<SaveAppelResult> {
  try {
    await withTenant(tenantId, async (tx) => {
      const teacherId = await getTeacherPersonId(tx, userId);
      if (!teacherId) throw new Error('Profil enseignant introuvable.');
      if (!(await teacherOwnsEntry(tx, teacherId, entryId)))
        throw new Error('Séance non autorisée.');
      const sess = await tx.attendanceSession.findUnique({
        where: { id: sessionId },
        select: { vsLocked: true },
      });
      if (sess?.vsLocked)
        throw new Error('Appel verrouillé par la Vie scolaire — modification impossible.');
      await tx.attendanceSession.update({ where: { id: sessionId }, data: { finalizedAt: null } });
      await logAudit(tx, {
        tenantId,
        userId,
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

/** Payload de l'appel administratif : une classe et une date, pas de case d'EDT. */
export const adminAppelPayloadSchema = z.object({
  classId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodLabel: z.string().max(60).nullable().default(null),
  finalize: z.boolean().default(false),
  records: z.array(recordSchema).min(1).max(500),
});

export type AdminAppelPayload = z.infer<typeof adminAppelPayloadSchema>;

/**
 * Appel fait depuis le portail admin (Classes → Faire l'appel). Aucune case
 * d'EDT n'est en jeu : la séance est celle de la classe pour la date (et le
 * créneau, s'il est précisé). Identique à l'appel prof pour tout le reste —
 * mêmes catégories, même carnet, même file Vie scolaire.
 */
export async function saveAdminAppel(
  tenantId: string,
  userId: string,
  userEmail: string | null,
  payload: AdminAppelPayload,
): Promise<SaveAppelResult> {
  return saveAppelSheet(
    tenantId,
    userId,
    payload,
    async (tx) => {
      const cls = await tx.class.findUnique({
        where: { id: payload.classId },
        select: { id: true, deletedAt: true },
      });
      if (!cls) throw new Error('Classe introuvable.');
      if (cls.deletedAt) throw new Error('Classe archivée.');

      const dateOnly = new Date(`${payload.date}T00:00:00.000Z`);
      let sess = await tx.attendanceSession.findFirst({
        where: { classId: payload.classId, date: dateOnly, periodLabel: payload.periodLabel },
      });
      if (!sess) {
        sess = await tx.attendanceSession.create({
          data: {
            tenantId,
            classId: payload.classId,
            date: dateOnly,
            periodLabel: payload.periodLabel,
          },
        });
      }

      // Snapshot lisible de l'auteur, comme pour les entrées de carnet saisies
      // à la main depuis l'administration.
      const link = await tx.userPerson.findFirst({
        where: { userId },
        include: { person: { select: { firstName: true, lastName: true } } },
      });
      const authorName = link?.person
        ? `${link.person.firstName} ${link.person.lastName}`
        : (userEmail ?? 'Établissement');

      return {
        sessionId: sess.id,
        finalizedAt: sess.finalizedAt,
        authorName,
        authorRole: 'vie-scolaire',
      };
    },
    'admin',
  );
}
