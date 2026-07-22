'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { requireRoleCode } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { sendNotifications, parentRecipient, emailRecipient, type NotifyItem } from '@/lib/notify';
import { renderTemplate } from '@/lib/notify-templates';
import { sendDirectMessage } from '@/lib/inapp-message';

type Result = { ok: true; id?: string } | { ok: false; error: string };

/** Rôles autorisés à gérer le soutien scolaire (cadre + affectation). */
const SUPPORT_ROLES = ['tenant_admin', 'direction', 'cpe', 'scolarite'];

const DOW = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const PRICING = ['FREE', 'PER_SESSION', 'MONTHLY', 'TERM', 'ANNUAL'] as const;
type PricingMode = (typeof PRICING)[number];
const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
};

type SlotInput = { dayOfWeek: string; startTime: string; endTime: string; roomId: string | null };

/** Parse le champ `slots` (JSON) du formulaire en créneaux valides. */
function parseSlots(fd: FormData): SlotInput[] {
  const raw = str(fd, 'slots');
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown[];
    return arr
      .map((s) => s as Record<string, unknown>)
      .filter((s) => typeof s.dayOfWeek === 'string' && DOW.includes(s.dayOfWeek as string) && s.startTime && s.endTime)
      .map((s) => ({
        dayOfWeek: s.dayOfWeek as string,
        startTime: String(s.startTime),
        endTime: String(s.endTime),
        roomId: s.roomId ? String(s.roomId) : null,
      }));
  } catch {
    return [];
  }
}

function pricing(fd: FormData): { mode: PricingMode; price: number } {
  const m = str(fd, 'pricingMode');
  const mode: PricingMode = m && (PRICING as readonly string[]).includes(m) ? (m as PricingMode) : 'FREE';
  const price = mode === 'FREE' ? 0 : Number(str(fd, 'price') ?? '0') || 0;
  return { mode, price };
}

async function guard() {
  const session = await auth();
  if (!session?.user) return null;
  await requireRoleCode(SUPPORT_ROLES);
  return session;
}

/** Crée un cours de soutien (rattaché à l'année active). */
export async function createSupportCourseAction(fd: FormData): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const tenantId = s.user.tenantId;
  const title = str(fd, 'title');
  const subjectId = str(fd, 'subjectId');
  if (!title || !subjectId) return { ok: false, error: 'Titre et matière requis.' };
  const { mode, price } = pricing(fd);
  const slots = parseSlots(fd);

  try {
    const id = await withTenant(tenantId, async (tx) => {
      const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });
      if (!year) throw new Error('Aucune année scolaire active.');
      const c = await tx.supportCourse.create({
        data: {
          tenantId,
          academicYearId: year.id,
          subjectId,
          teacherId: str(fd, 'teacherId') ?? null,
          levelId: str(fd, 'levelId') ?? null,
          title,
          pricingMode: mode,
          price,
          description: str(fd, 'description') ?? null,
          slots: {
            create: slots.map((sl) => ({
              tenantId,
              dayOfWeek: sl.dayOfWeek as 'MON',
              startTime: sl.startTime,
              endTime: sl.endTime,
              roomId: sl.roomId,
            })),
          },
        },
      });
      await logAudit(tx, { tenantId, userId: s.user.id, action: 'create', entityType: 'SupportCourse', entityId: c.id });
      return c.id;
    });
    revalidatePath('/admin/soutien');
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/** Met à jour un cours de soutien. */
export async function updateSupportCourseAction(id: string, fd: FormData): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const tenantId = s.user.tenantId;
  const title = str(fd, 'title');
  const subjectId = str(fd, 'subjectId');
  if (!title || !subjectId) return { ok: false, error: 'Titre et matière requis.' };
  const { mode, price } = pricing(fd);
  const slots = parseSlots(fd);

  try {
    await withTenant(tenantId, async (tx) => {
      await tx.supportCourse.update({
        where: { id },
        data: {
          subjectId,
          teacherId: str(fd, 'teacherId') ?? null,
          levelId: str(fd, 'levelId') ?? null,
          title,
          pricingMode: mode,
          price,
          description: str(fd, 'description') ?? null,
        },
      });
      // Remplace les créneaux (suppression + recréation).
      await tx.supportSlot.deleteMany({ where: { supportCourseId: id } });
      if (slots.length) {
        await tx.supportSlot.createMany({
          data: slots.map((sl) => ({
            tenantId,
            supportCourseId: id,
            dayOfWeek: sl.dayOfWeek as 'MON',
            startTime: sl.startTime,
            endTime: sl.endTime,
            roomId: sl.roomId,
          })),
        });
      }
    });
    revalidatePath('/admin/soutien');
    revalidatePath(`/admin/soutien/${id}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/** Archive (désactive) un cours de soutien. */
export async function toggleSupportCourseAction(id: string, active: boolean): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  await withTenant(s.user.tenantId, (tx) => tx.supportCourse.update({ where: { id }, data: { active } }));
  revalidatePath('/admin/soutien');
  revalidatePath(`/admin/soutien/${id}`);
  return { ok: true };
}

/**
 * Affecte un élève à un cours de soutien (volontaire ou recommandé) et notifie
 * ses parents (message interne + e-mail). Réactive une inscription retirée.
 */
export async function enrollSupportStudentAction(
  courseId: string,
  studentId: string,
  recommended: boolean,
): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const tenantId = s.user.tenantId;
  if (!studentId) return { ok: false, error: 'Élève requis.' };

  try {
    await withTenant(tenantId, async (tx) => {
      const course = await tx.supportCourse.findUnique({
        where: { id: courseId },
        select: {
          id: true,
          title: true,
          subjectId: true,
          slots: { select: { dayOfWeek: true, startTime: true }, orderBy: { startTime: 'asc' }, take: 1 },
        },
      });
      if (!course) throw new Error('Cours introuvable.');
      const student = await tx.person.findUnique({
        where: { id: studentId },
        select: { type: true, firstName: true, lastName: true },
      });
      if (!student || student.type !== 'STUDENT') throw new Error('Élève introuvable.');

      const existing = await tx.supportEnrollment.findUnique({
        where: { supportCourseId_studentId: { supportCourseId: courseId, studentId } },
      });
      if (existing && existing.status === 'ACTIVE' && !existing.unenrolledAt) {
        throw new Error('Élève déjà inscrit à ce cours.');
      }
      if (existing) {
        await tx.supportEnrollment.update({
          where: { id: existing.id },
          data: { status: 'ACTIVE', unenrolledAt: null, enrolledAt: new Date(), recommended },
        });
      } else {
        await tx.supportEnrollment.create({
          data: { tenantId, supportCourseId: courseId, studentId, recommended, status: 'ACTIVE' },
        });
      }

      // Notifie les parents.
      const subject = await tx.subject.findUnique({ where: { id: course.subjectId }, select: { label: true } });
      const locale = (await tx.tenant.findFirst({ select: { localeDefault: true } }))?.localeDefault ?? 'fr';
      const slot0 = course.slots[0];
      const slot = slot0 ? `${slot0.dayOfWeek} ${slot0.startTime}` : '';
      const data = {
        child: `${student.firstName} ${student.lastName}`,
        course: course.title,
        subject: subject?.label ?? '',
        slot,
      };
      const body = renderTemplate('support.enrolled', data, locale);
      const items: NotifyItem[] = [];
      const relations = await tx.personRelation.findMany({
        where: { childId: studentId },
        select: { parent: { select: { id: true, contacts: true, userPersons: { select: { userId: true, user: { select: { email: true } } } } } } },
        orderBy: { createdAt: 'asc' },
      });
      const seen = new Set<string>();
      for (const r of relations) {
        if (seen.has(r.parent.id)) continue;
        seen.add(r.parent.id);
        const up = r.parent.userPersons[0];
        if (up?.userId) {
          await sendDirectMessage(tx, { tenantId, fromUserId: s.user.id, toUserId: up.userId, subject: `Cours de soutien — ${course.title}`, body });
        }
        items.push({ channel: 'EMAIL', recipient: emailRecipient(r.parent.contacts, up?.user?.email), template: 'support.enrolled', data, studentId, relatedType: 'SupportCourse', relatedId: courseId });
        items.push({ recipient: parentRecipient(r.parent.contacts), template: 'support.enrolled', data, studentId, relatedType: 'SupportCourse', relatedId: courseId });
      }
      await sendNotifications(tx, tenantId, locale, items);
      await logAudit(tx, { tenantId, userId: s.user.id, action: 'enroll', entityType: 'SupportEnrollment', entityId: studentId, after: { courseId, recommended } });
    });
    revalidatePath(`/admin/soutien/${courseId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/**
 * Retire un élève d'un cours de soutien et nettoie ses échéances non réglées.
 * Les échéances futures générées pour ce cours qui n'ont reçu aucun paiement sont
 * supprimées (l'élève n'y participe plus) ; celles ayant reçu un paiement sont
 * conservées pour l'intégrité comptable.
 */
export async function unenrollSupportStudentAction(courseId: string, studentId: string): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  await withTenant(s.user.tenantId, async (tx) => {
    await tx.supportEnrollment.updateMany({
      where: { supportCourseId: courseId, studentId, unenrolledAt: null },
      data: { status: 'WITHDRAWN', unenrolledAt: new Date() },
    });
    const unpaid = await tx.installment.findMany({
      where: { supportCourseId: courseId, studentId, payments: { none: {} } },
      select: { id: true },
    });
    if (unpaid.length) {
      await tx.installment.deleteMany({ where: { id: { in: unpaid.map((i) => i.id) } } });
      await logAudit(tx, { tenantId: s.user.tenantId, userId: s.user.id, action: 'unenroll_cleanup', entityType: 'SupportEnrollment', entityId: studentId, after: { courseId, removedInstallments: unpaid.length } });
    }
  });
  revalidatePath(`/admin/soutien/${courseId}`);
  revalidatePath('/admin/finance');
  return { ok: true };
}

// ─── P2 : Pédagogie (séances, appel, appréciations, ressources) ────────────

/** Crée une séance datée (contenu/thème) pour un cours. */
export async function createSupportSessionAction(courseId: string, fd: FormData): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const dateStr = str(fd, 'date');
  if (!dateStr) return { ok: false, error: 'Date requise.' };
  try {
    const id = await withTenant(s.user.tenantId, async (tx) => {
      const sess = await tx.supportSession.upsert({
        where: { supportCourseId_date: { supportCourseId: courseId, date: new Date(`${dateStr}T00:00:00.000Z`) } },
        create: { tenantId: s.user.tenantId, supportCourseId: courseId, date: new Date(`${dateStr}T00:00:00.000Z`), topic: str(fd, 'topic') ?? null },
        update: { topic: str(fd, 'topic') ?? null },
      });
      return sess.id;
    });
    revalidatePath(`/admin/soutien/${courseId}`);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/** Met à jour le thème/contenu d'une séance (utile si oublié à la création). */
export async function updateSupportSessionTopicAction(sessionId: string, topic: string): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const courseId = await withTenant(s.user.tenantId, async (tx) => {
    const sess = await tx.supportSession.update({ where: { id: sessionId }, data: { topic: topic.trim() || null }, select: { supportCourseId: true } });
    return sess.supportCourseId;
  });
  revalidatePath(`/admin/soutien/${courseId}/seance/${sessionId}`);
  revalidatePath(`/admin/soutien/${courseId}`);
  return { ok: true };
}

/** Enregistre l'appel + les appréciations d'une séance et notifie les nouvelles absences. */
export async function saveSupportAttendanceAction(
  sessionId: string,
  records: { studentId: string; present: boolean; appreciation: string }[],
): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const tenantId = s.user.tenantId;
  try {
    const courseId = await withTenant(tenantId, async (tx) => {
      const sess = await tx.supportSession.findUnique({
        where: { id: sessionId },
        select: { supportCourseId: true, date: true, topic: true, course: { select: { title: true } } },
      });
      if (!sess) throw new Error('Séance introuvable.');

      const existing = new Map(
        (await tx.supportAttendance.findMany({ where: { sessionId }, select: { studentId: true, present: true } })).map((a) => [a.studentId, a.present]),
      );
      const newlyAbsent: string[] = [];
      for (const r of records) {
        const was = existing.get(r.studentId);
        await tx.supportAttendance.upsert({
          where: { sessionId_studentId: { sessionId, studentId: r.studentId } },
          create: { tenantId, sessionId, studentId: r.studentId, present: r.present, appreciation: r.appreciation.trim() || null },
          update: { present: r.present, appreciation: r.appreciation.trim() || null },
        });
        // Nouvelle absence (pas déjà notée absente) → notification.
        if (!r.present && was !== false) newlyAbsent.push(r.studentId);
      }

      if (newlyAbsent.length) {
        const locale = (await tx.tenant.findFirst({ select: { localeDefault: true } }))?.localeDefault ?? 'fr';
        const dateLabel = sess.date.toISOString().slice(0, 10).split('-').reverse().join('/');
        const students = await tx.person.findMany({
          where: { id: { in: newlyAbsent } },
          select: {
            id: true, firstName: true, lastName: true, contacts: true,
            userPersons: { select: { userId: true, user: { select: { email: true } } } },
            relationsAsChild: { select: { parent: { select: { contacts: true, userPersons: { select: { userId: true, user: { select: { email: true } } } } } } } },
          },
        });
        const items: NotifyItem[] = [];
        for (const st of students) {
          const data = { child: `${st.firstName} ${st.lastName}`, course: sess.course.title, date: dateLabel, topic: sess.topic ?? '' };
          const body = renderTemplate('support.absent', data, locale);
          const subject = `Absence — ${sess.course.title}`;
          const su = st.userPersons[0];
          if (su?.userId) await sendDirectMessage(tx, { tenantId, fromUserId: s.user.id, toUserId: su.userId, subject, body });
          items.push({ channel: 'EMAIL', recipient: emailRecipient(st.contacts, su?.user?.email), template: 'support.absent', data, studentId: st.id, relatedType: 'SupportSession', relatedId: sessionId });
          const seen = new Set<string>();
          for (const r of st.relationsAsChild) {
            const up = r.parent.userPersons[0];
            const key = up?.userId ?? '';
            if (key && seen.has(key)) continue;
            if (key) seen.add(key);
            if (up?.userId) await sendDirectMessage(tx, { tenantId, fromUserId: s.user.id, toUserId: up.userId, subject, body });
            items.push({ channel: 'EMAIL', recipient: emailRecipient(r.parent.contacts, up?.user?.email), template: 'support.absent', data, studentId: st.id, relatedType: 'SupportSession', relatedId: sessionId });
            items.push({ recipient: parentRecipient(r.parent.contacts), template: 'support.absent', data, studentId: st.id, relatedType: 'SupportSession', relatedId: sessionId });
          }
        }
        await sendNotifications(tx, tenantId, locale, items);
      }
      return sess.supportCourseId;
    });
    revalidatePath(`/admin/soutien/${courseId}/seance/${sessionId}`);
    revalidatePath(`/admin/soutien/${courseId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/** Ajoute une ressource pédagogique (titre + lien) rattachée à une séance. */
export async function addSupportResourceAction(sessionId: string, fd: FormData): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const title = str(fd, 'title');
  const url = str(fd, 'url');
  if (!title || !url) return { ok: false, error: 'Titre et lien requis.' };
  const courseId = await withTenant(s.user.tenantId, async (tx) => {
    const sess = await tx.supportSession.findUnique({ where: { id: sessionId }, select: { supportCourseId: true } });
    if (!sess) throw new Error('Séance introuvable.');
    await tx.supportResource.create({
      data: { tenantId: s.user.tenantId, supportCourseId: sess.supportCourseId, supportSessionId: sessionId, title, url },
    });
    return sess.supportCourseId;
  });
  revalidatePath(`/admin/soutien/${courseId}/seance/${sessionId}`);
  return { ok: true };
}

/** Supprime une ressource pédagogique. */
export async function deleteSupportResourceAction(sessionId: string, id: string): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const courseId = await withTenant(s.user.tenantId, async (tx) => {
    const r = await tx.supportResource.delete({ where: { id }, select: { supportCourseId: true } });
    return r.supportCourseId;
  });
  revalidatePath(`/admin/soutien/${courseId}/seance/${sessionId}`);
  return { ok: true };
}

// ─── P5 : Séances ↔ compétences ────────────────────────────────────────────

/** Définit les compétences travaillées lors d'une séance de soutien. */
export async function setSessionSkillsAction(sessionId: string, nodeIds: string[]): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const tenantId = s.user.tenantId;
  try {
    const courseId = await withTenant(tenantId, async (tx) => {
      const sess = await tx.supportSession.findUnique({
        where: { id: sessionId },
        select: { supportCourseId: true },
      });
      if (!sess) throw new Error('Séance introuvable.');
      await tx.supportSessionSkill.deleteMany({ where: { supportSessionId: sessionId } });
      if (nodeIds.length > 0) {
        await tx.supportSessionSkill.createMany({
          data: nodeIds.map((nodeId) => ({ tenantId, supportSessionId: sessionId, nodeId })),
          skipDuplicates: true,
        });
      }
      return sess.supportCourseId;
    });
    revalidatePath(`/admin/soutien/${courseId}/seance/${sessionId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/**
 * Évalue les élèves d'une séance de soutien sur une compétence ciblée.
 * L'évaluation est tracée `source = SUPPORT` avec la séance d'origine, ce qui
 * permet ensuite de mesurer l'impact du soutien sur les acquis.
 */
export async function saveSessionCompetencyAction(
  sessionId: string,
  nodeId: string,
  records: { studentId: string; masteryLevelId: string | null }[],
): Promise<Result & { saved?: number }> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const tenantId = s.user.tenantId;
  const userId = s.user.id;
  try {
    const { courseId, saved } = await withTenant(tenantId, async (tx) => {
      const sess = await tx.supportSession.findUnique({
        where: { id: sessionId },
        select: { supportCourseId: true, date: true },
      });
      if (!sess) throw new Error('Séance introuvable.');
      // La compétence doit faire partie des compétences ciblées par la séance.
      const targeted = await tx.supportSessionSkill.findFirst({
        where: { supportSessionId: sessionId, nodeId },
        select: { id: true },
      });
      if (!targeted) throw new Error('Compétence non ciblée par cette séance.');

      // Période contenant la date de la séance.
      const period = await tx.period.findFirst({
        where: { startDate: { lte: sess.date }, endDate: { gte: sess.date } },
        select: { id: true },
      });
      if (!period) throw new Error('Aucune période ne couvre la date de cette séance.');

      let count = 0;
      for (const r of records) {
        if (!r.masteryLevelId) {
          await tx.competencyAssessment.deleteMany({
            where: { studentId: r.studentId, nodeId, periodId: period.id, evaluatedByUserId: userId },
          });
          continue;
        }
        await tx.competencyAssessment.upsert({
          where: {
            studentId_nodeId_periodId_evaluatedByUserId: {
              studentId: r.studentId,
              nodeId,
              periodId: period.id,
              evaluatedByUserId: userId,
            },
          },
          create: {
            tenantId,
            studentId: r.studentId,
            nodeId,
            periodId: period.id,
            masteryLevelId: r.masteryLevelId,
            evaluatedByUserId: userId,
            source: 'SUPPORT',
            supportSessionId: sessionId,
          },
          update: { masteryLevelId: r.masteryLevelId, source: 'SUPPORT', supportSessionId: sessionId },
        });
        count++;
      }
      await logAudit(tx, {
        tenantId,
        userId,
        action: 'assess_support',
        entityType: 'CompetencyAssessment',
        entityId: sessionId,
        after: { nodeId, count },
      });
      return { courseId: sess.supportCourseId, saved: count };
    });
    revalidatePath(`/admin/soutien/${courseId}/seance/${sessionId}`);
    return { ok: true, saved };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

// ─── P3 : Facturation ──────────────────────────────────────────────────────

/**
 * Génère / met à jour la facturation d'un cours payant pour ses élèves inscrits,
 * selon le mode : mensuel (10 échéances Sept→Juin), trimestriel (3), annuel (1),
 * ou par séance (1 par séance datée). Ré-applique le tarif courant : les
 * échéances non réglées d'un élève sont remplacées (utile après un changement de
 * mode/prix) ; celles ayant reçu un paiement sont conservées intactes. Les
 * échéances portent `supportCourseId` → activité « Soutien ».
 */
export async function generateSupportBillingAction(courseId: string): Promise<Result & { created?: number }> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const tenantId = s.user.tenantId;
  try {
    const created = await withTenant(tenantId, async (tx) => {
      const course = await tx.supportCourse.findUnique({
        where: { id: courseId },
        select: { pricingMode: true, price: true, academicYearId: true, title: true },
      });
      if (!course) throw new Error('Cours introuvable.');
      if (course.pricingMode === 'FREE') throw new Error('Cours gratuit : pas de facturation.');
      const price = Number(course.price);
      if (price <= 0) throw new Error('Tarif non défini.');

      const year = await tx.academicYear.findUnique({ where: { id: course.academicYearId }, select: { startDate: true } });
      const start = year ? new Date(year.startDate) : new Date();
      const y = start.getUTCFullYear();
      const m0 = start.getUTCMonth();
      const monthDue = (k: number) => new Date(Date.UTC(y, m0 + k, 5));

      // Échéances à générer (label + date + montant), communes à tous les élèves.
      const template: { label: string; dueDate: Date; amount: number }[] = [];
      if (course.pricingMode === 'MONTHLY') {
        for (let k = 0; k < 10; k++) template.push({ label: `${course.title} — ${k + 1}/10`, dueDate: monthDue(k), amount: price });
      } else if (course.pricingMode === 'TERM') {
        for (let k = 0; k < 3; k++) template.push({ label: `${course.title} — T${k + 1}`, dueDate: monthDue(k * 4), amount: price });
      } else if (course.pricingMode === 'ANNUAL') {
        template.push({ label: `${course.title} — Annuel`, dueDate: monthDue(0), amount: price });
      } else {
        // PER_SESSION : une échéance par séance datée existante.
        const sessions = await tx.supportSession.findMany({ where: { supportCourseId: courseId }, orderBy: { date: 'asc' }, select: { date: true } });
        sessions.forEach((se, i) => template.push({ label: `${course.title} — séance ${i + 1}`, dueDate: se.date, amount: price }));
      }
      if (template.length === 0) throw new Error('Aucune échéance à générer (ajoutez des séances).');

      const enrollments = await tx.supportEnrollment.findMany({ where: { supportCourseId: courseId, status: 'ACTIVE', unenrolledAt: null }, select: { studentId: true } });
      // Échéances existantes du cours + nb de paiements (pour ne pas toucher aux
      // échéances déjà (partiellement) encaissées).
      const existing = await tx.installment.findMany({
        where: { supportCourseId: courseId },
        select: { id: true, studentId: true, _count: { select: { payments: true } } },
      });
      const byStudent = new Map<string, { ids: string[]; hasPaid: boolean }>();
      for (const i of existing) {
        const agg = byStudent.get(i.studentId) ?? { ids: [], hasPaid: false };
        agg.ids.push(i.id);
        if (i._count.payments > 0) agg.hasPaid = true;
        byStudent.set(i.studentId, agg);
      }

      let count = 0;
      for (const e of enrollments) {
        const cur = byStudent.get(e.studentId);
        // Élève ayant déjà un encaissement : on ne régénère pas (intégrité compta).
        if (cur?.hasPaid) continue;
        // Sinon on remplace ses échéances non réglées par le tarif courant.
        if (cur && cur.ids.length) {
          await tx.installment.deleteMany({ where: { id: { in: cur.ids } } });
        }
        await tx.installment.createMany({
          data: template.map((tpl) => ({
            tenantId,
            studentId: e.studentId,
            supportCourseId: courseId,
            label: tpl.label,
            amount: tpl.amount,
            dueDate: tpl.dueDate,
            status: 'PENDING' as const,
          })),
        });
        count += template.length;
      }
      await logAudit(tx, { tenantId, userId: s.user.id, action: 'generate_billing', entityType: 'SupportCourse', entityId: courseId, after: { created: count } });
      return count;
    });
    revalidatePath(`/admin/soutien/${courseId}`);
    revalidatePath('/admin/finance');
    return { ok: true, created };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
