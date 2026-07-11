'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { announcementCreateSchema } from '@jawal/shared';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant, prismaAdmin } from '@/lib/db';
import { safeSendEmail } from '@/lib/email';
import { pushToTenant, pushToUsers } from '@/lib/push';

type Result<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

function fl<T>(parsed: z.SafeParseError<T>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join('.');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

function inputFromForm(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' ? v.trim() : '';
  };
  return {
    title: get('title'),
    body: get('body'),
    audience: get('audience'),
    classId: get('classId'),
    levelId: get('levelId'),
    publish: formData.get('publish') === 'on' || formData.get('publish') === 'true',
  };
}

export async function createAnnouncementAction(formData: FormData): Promise<Result<{ id: string }>> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('communication.write');

  const parsed = announcementCreateSchema.safeParse(inputFromForm(formData));
  if (!parsed.success) return { ok: false, error: 'Données invalides.', fieldErrors: fl(parsed) };

  const tenantId = session.user.tenantId;
  const data = parsed.data;

  const announcement = await withTenant(tenantId, async (tx) => {
    const a = await tx.announcement.create({
      data: {
        tenantId,
        authorId: session.user.id,
        title: data.title,
        body: data.body,
        audience: data.audience,
        classId: data.audience === 'CLASS' ? data.classId : null,
        levelId: data.audience === 'LEVEL' ? data.levelId : null,
        publishedAt: data.publish ? new Date() : null,
      },
    });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: data.publish ? 'publish' : 'draft',
      entityType: 'Announcement',
      entityId: a.id,
      after: { title: a.title, audience: a.audience },
    });
    return a;
  });

  // Notifications email aux contacts ciblés (best-effort, hors transaction)
  if (announcement.publishedAt) {
    await notifyAudience(tenantId, announcement);
  }

  revalidatePath('/admin/announcements');
  return { ok: true, data: { id: announcement.id } };
}

export async function publishAnnouncementAction(id: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('communication.write');

  const tenantId = session.user.tenantId;
  const announcement = await withTenant(tenantId, async (tx) => {
    const a = await tx.announcement.update({
      where: { id },
      data: { publishedAt: new Date() },
    });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'publish',
      entityType: 'Announcement',
      entityId: id,
    });
    return a;
  });

  await notifyAudience(tenantId, announcement);
  revalidatePath('/admin/announcements');
  return { ok: true };
}

export async function deleteAnnouncementAction(id: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('communication.write');

  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    const before = await tx.announcement.findUnique({ where: { id } });
    if (!before) throw new Error('Annonce introuvable');
    await tx.announcement.delete({ where: { id } });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'delete',
      entityType: 'Announcement',
      entityId: id,
      before: { title: before.title },
    });
  });
  revalidatePath('/admin/announcements');
  return { ok: true };
}

/** Récupère les emails des destinataires selon l'audience puis envoie. */
async function notifyAudience(
  tenantId: string,
  announcement: { title: string; body: string; audience: string; classId: string | null; levelId: string | null },
): Promise<void> {
  // Push mobile aux parents concernés (best-effort, en plus de l'email).
  await pushAnnouncement(tenantId, announcement);

  // On utilise prismaAdmin pour aller chercher les personnes — best-effort,
  // l'isolation est garantie par le filtre tenantId.
  let recipients: { firstName: string; lastName: string; contacts: unknown }[] = [];
  switch (announcement.audience) {
    case 'ALL':
      recipients = await prismaAdmin.person.findMany({
        where: { tenantId, deletedAt: null },
        select: { firstName: true, lastName: true, contacts: true },
      });
      break;
    case 'PARENTS':
      recipients = await prismaAdmin.person.findMany({
        where: { tenantId, type: 'PARENT', deletedAt: null },
        select: { firstName: true, lastName: true, contacts: true },
      });
      break;
    case 'TEACHERS':
      recipients = await prismaAdmin.person.findMany({
        where: { tenantId, type: 'TEACHER', deletedAt: null },
        select: { firstName: true, lastName: true, contacts: true },
      });
      break;
    case 'STAFF':
      recipients = await prismaAdmin.person.findMany({
        where: { tenantId, type: 'STAFF', deletedAt: null },
        select: { firstName: true, lastName: true, contacts: true },
      });
      break;
    case 'CLASS':
      if (!announcement.classId) return;
      // Pour MVP : on prend les élèves de la classe + leurs emails directs
      // (V1 : remonter aux parents via UserPerson)
      const enrollments = await prismaAdmin.studentClass.findMany({
        where: { tenantId, classId: announcement.classId, unenrolledAt: null },
        include: { student: { select: { firstName: true, lastName: true, contacts: true } } },
      });
      recipients = enrollments.map((e) => e.student);
      break;
    case 'LEVEL':
      // Tous les élèves au niveau X
      if (!announcement.levelId) return;
      const classes = await prismaAdmin.class.findMany({
        where: { tenantId, levelId: announcement.levelId, deletedAt: null },
        select: { id: true },
      });
      const enrollments2 = await prismaAdmin.studentClass.findMany({
        where: { tenantId, classId: { in: classes.map((c) => c.id) }, unenrolledAt: null },
        include: { student: { select: { firstName: true, lastName: true, contacts: true } } },
      });
      recipients = enrollments2.map((e) => e.student);
      break;
  }

  const tenant = await prismaAdmin.tenant.findUnique({ where: { id: tenantId } });
  await Promise.all(
    recipients.map(async (r) => {
      const contacts = (r.contacts ?? {}) as { email?: string };
      const email = contacts.email;
      if (!email) return;
      await safeSendEmail({
        to: email,
        subject: `[${tenant?.name ?? 'Jawal'}] ${announcement.title}`,
        html: `<p>Bonjour ${r.firstName},</p><p>${announcement.body.replace(/\n/g, '<br/>')}</p><hr/><p style="font-size:11px;color:#888">Annonce — ${tenant?.name}</p>`,
        text: `${announcement.title}\n\n${announcement.body}`,
      });
    }),
  );
}

/** Notification push aux parents concernés par une annonce (best-effort). */
async function pushAnnouncement(
  tenantId: string,
  announcement: { title: string; body: string; audience: string; classId: string | null; levelId: string | null },
): Promise<void> {
  const payload = {
    title: announcement.title,
    body: announcement.body.length > 140 ? `${announcement.body.slice(0, 137)}…` : announcement.body,
    data: { type: 'announcement' as const },
  };
  try {
    switch (announcement.audience) {
      // App parent → tous les appareils du tenant sont des parents.
      case 'ALL':
      case 'PARENTS':
        await pushToTenant(tenantId, payload);
        break;
      case 'CLASS': {
        if (!announcement.classId) return;
        const scs = await prismaAdmin.studentClass.findMany({
          where: { tenantId, classId: announcement.classId, unenrolledAt: null },
          select: { studentId: true },
        });
        await pushToParentsOfStudents(tenantId, scs.map((s) => s.studentId), payload);
        break;
      }
      case 'LEVEL': {
        if (!announcement.levelId) return;
        const classes = await prismaAdmin.class.findMany({
          where: { tenantId, levelId: announcement.levelId, deletedAt: null },
          select: { id: true },
        });
        const scs = await prismaAdmin.studentClass.findMany({
          where: { tenantId, classId: { in: classes.map((c) => c.id) }, unenrolledAt: null },
          select: { studentId: true },
        });
        await pushToParentsOfStudents(tenantId, scs.map((s) => s.studentId), payload);
        break;
      }
      // TEACHERS / STAFF : pas concernés par l'app parent.
    }
  } catch (e) {
    console.error('[push] annonce échouée', e);
  }
}

async function pushToParentsOfStudents(
  tenantId: string,
  studentIds: string[],
  payload: { title: string; body: string; data?: Record<string, unknown> },
): Promise<void> {
  if (studentIds.length === 0) return;
  const rels = await prismaAdmin.personRelation.findMany({
    where: { childId: { in: studentIds } },
    select: { parentId: true },
  });
  const parentIds = [...new Set(rels.map((r) => r.parentId))];
  if (parentIds.length === 0) return;
  const ups = await prismaAdmin.userPerson.findMany({
    where: { personId: { in: parentIds } },
    select: { userId: true },
  });
  await pushToUsers(tenantId, ups.map((u) => u.userId), payload);
}
