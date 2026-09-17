import 'server-only';
import { withTenant } from '@/lib/db';
import { safeSendEmail } from '@/lib/email';
import { createStaffAlerts } from '@/lib/staff-alerts';
import { minutesOfTime, timeOfMinutes } from '@/lib/exam-schedule';

/**
 * Communication d'une session d'examen aux familles et aux élèves.
 *
 * - **À la publication** : le calendrier des épreuves part par e-mail aux
 *   parents et à l'élève.
 * - **À J-3 du début** : rappel par e-mail, et alerte dans l'espace des parents
 *   et des élèves qui ont un compte.
 *
 * Chaque envoi est tracé dans `notification_logs` (envoyé, échec, sans adresse)
 * — c'est aussi ce qui empêche un second envoi du même message.
 */
const RELATED_TYPE = 'ExamSession';
export const TEMPLATE_PUBLISHED = 'exam.published';
export const TEMPLATE_REMINDER = 'exam.reminder3d';
const REMINDER_DAYS = 3;

type Audience = {
  tenantName: string;
  session: { id: string; label: string; startDate: Date; endDate: Date };
  papers: Array<{ date: Date; startTime: string; durationMin: number; subject: string }>;
  students: Array<{ id: string; name: string; emails: string[]; userIds: string[] }>;
};

const emailOf = (c: unknown) => ((c ?? {}) as { email?: string }).email?.trim() || null;

/** Élèves concernés (classes du niveau et des filières de la session), leurs parents, leurs comptes. */
async function loadAudience(tenantId: string, sessionId: string): Promise<Audience | null> {
  return withTenant(tenantId, async (tx) => {
    const session = await tx.examSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        label: true,
        startDate: true,
        endDate: true,
        levelId: true,
        academicYearId: true,
        tracks: { select: { trackId: true } },
        papers: {
          orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
          select: { date: true, startTime: true, durationMin: true, subject: { select: { label: true } } },
        },
      },
    });
    if (!session) return null;
    const trackIds = session.tracks.map((t) => t.trackId);
    const enrolments = await tx.studentClass.findMany({
      where: {
        unenrolledAt: null,
        class: {
          academicYearId: session.academicYearId,
          levelId: session.levelId,
          deletedAt: null,
          ...(trackIds.length > 0 ? { trackId: { in: trackIds } } : {}),
        },
      },
      select: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            contacts: true,
            relationsAsChild: { select: { parent: { select: { id: true, contacts: true } } } },
          },
        },
      },
    });
    const people = new Map(enrolments.map((e) => [e.student.id, e.student]));
    const personIds = [
      ...people.keys(),
      ...[...people.values()].flatMap((s) => s.relationsAsChild.map((r) => r.parent.id)),
    ];
    const accounts = personIds.length
      ? await tx.userPerson.findMany({ where: { personId: { in: personIds } }, select: { personId: true, userId: true } })
      : [];
    const usersOf = new Map<string, string[]>();
    for (const a of accounts) usersOf.set(a.personId, [...(usersOf.get(a.personId) ?? []), a.userId]);
    const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });

    return {
      tenantName: tenant?.name ?? 'LeadSchool',
      session: { id: session.id, label: session.label, startDate: session.startDate, endDate: session.endDate },
      papers: session.papers.map((p) => ({ ...p, subject: p.subject.label })),
      students: [...people.values()].map((s) => {
        const parentIds = s.relationsAsChild.map((r) => r.parent.id);
        const emails = [
          ...s.relationsAsChild.map((r) => emailOf(r.parent.contacts)),
          emailOf(s.contacts),
        ].filter((e): e is string => Boolean(e));
        return {
          id: s.id,
          name: `${s.firstName} ${s.lastName}`,
          emails: [...new Set(emails)],
          userIds: [...new Set([s.id, ...parentIds].flatMap((id) => usersOf.get(id) ?? []))],
        };
      }),
    };
  });
}

const fmtDate = (d: Date) =>
  d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function calendarHtml(a: Audience): string {
  if (a.papers.length === 0) return '<p><em>Le détail des épreuves sera communiqué prochainement.</em></p>';
  const rows = a.papers
    .map((p) => {
      const start = minutesOfTime(p.startTime);
      const end = start === null ? '' : ` – ${timeOfMinutes(start + p.durationMin)}`;
      return `<tr><td style="padding:4px 10px">${fmtDate(p.date)}</td><td style="padding:4px 10px">${p.startTime}${end}</td><td style="padding:4px 10px"><strong>${p.subject}</strong></td></tr>`;
    })
    .join('');
  return `<table style="border-collapse:collapse;border:1px solid #e2e8f0"><thead><tr style="background:#f8fafc"><th style="padding:6px 10px;text-align:left">Date</th><th style="padding:6px 10px;text-align:left">Horaire</th><th style="padding:6px 10px;text-align:left">Épreuve</th></tr></thead><tbody>${rows}</tbody></table>`;
}

async function sendToAudience(
  tenantId: string,
  a: Audience,
  template: string,
  subject: string,
  intro: (studentName: string) => string,
): Promise<{ sent: number; skipped: number }> {
  let sent = 0;
  let skipped = 0;
  const calendar = calendarHtml(a);
  for (const s of a.students) {
    const log = (status: 'SENT' | 'FAILED' | 'SKIPPED', error?: string) =>
      withTenant(tenantId, (tx) =>
        tx.notificationLog.create({
          data: {
            tenantId,
            channel: 'EMAIL',
            recipient: s.emails.join(', '),
            recipientName: s.name,
            studentId: s.id,
            template,
            body: `${a.session.label} — ${s.name}`,
            status,
            error,
            relatedType: RELATED_TYPE,
            relatedId: a.session.id,
            sentAt: status === 'SENT' ? new Date() : null,
          },
        }),
      );
    if (s.emails.length === 0) {
      await log('SKIPPED', 'aucune adresse de contact');
      skipped += 1;
      continue;
    }
    const res = await safeSendEmail({
      to: s.emails.join(', '),
      subject,
      html: `<p>Bonjour,</p><p>${intro(s.name)}</p>${calendar}<p>Cordialement,<br/>${a.tenantName}</p><hr/><p style="font-size:11px;color:#888">Notification automatique — ne pas répondre à cet e-mail.</p>`,
      text: `${intro(s.name)} ${a.papers.map((p) => `${fmtDate(p.date)} ${p.startTime} ${p.subject}`).join(' ; ')}`,
    });
    await log(res.ok ? 'SENT' : 'FAILED', res.ok ? undefined : res.error);
    if (res.ok) sent += 1;
    else skipped += 1;
  }
  return { sent, skipped };
}

/** Déjà envoyé pour cette session ? */
async function alreadySent(tenantId: string, sessionId: string, template: string): Promise<boolean> {
  const n = await withTenant(tenantId, (tx) =>
    tx.notificationLog.count({ where: { relatedType: RELATED_TYPE, relatedId: sessionId, template } }),
  );
  return n > 0;
}

/** Publication : calendrier par e-mail aux parents et aux élèves (une seule fois par session). */
export async function notifyExamPublished(tenantId: string, sessionId: string): Promise<{ sent: number; skipped: number }> {
  if (await alreadySent(tenantId, sessionId, TEMPLATE_PUBLISHED)) return { sent: 0, skipped: 0 };
  const a = await loadAudience(tenantId, sessionId);
  if (!a) return { sent: 0, skipped: 0 };
  const period = `du ${fmtDate(a.session.startDate)} au ${fmtDate(a.session.endDate)}`;
  return sendToAudience(
    tenantId,
    a,
    TEMPLATE_PUBLISHED,
    `[${a.tenantName}] ${a.session.label} — calendrier des épreuves`,
    (name) => `La session <strong>${a.session.label}</strong> se tiendra ${period}. Voici le calendrier des épreuves de <strong>${name}</strong> :`,
  );
}

/**
 * Rappel à J-3 : sessions publiées débutant dans trois jours. À lancer une fois
 * par jour ; un second passage le même jour n'envoie rien.
 */
export async function runExamRemindersForTenant(tenantId: string): Promise<{ sessions: number; sent: number; skipped: number }> {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + REMINDER_DAYS));
  const end = new Date(start.getTime() + 86_400_000);
  const sessions = await withTenant(tenantId, (tx) =>
    tx.examSession.findMany({
      where: { status: 'PUBLISHED', startDate: { gte: start, lt: end } },
      select: { id: true },
    }),
  );
  let sent = 0;
  let skipped = 0;
  let done = 0;
  for (const { id } of sessions) {
    if (await alreadySent(tenantId, id, TEMPLATE_REMINDER)) continue;
    const a = await loadAudience(tenantId, id);
    if (!a) continue;
    const r = await sendToAudience(
      tenantId,
      a,
      TEMPLATE_REMINDER,
      `[${a.tenantName}] Rappel : ${a.session.label} commence dans ${REMINDER_DAYS} jours`,
      (name) => `Rappel : la session <strong>${a.session.label}</strong> commence le <strong>${fmtDate(a.session.startDate)}</strong>. Calendrier des épreuves de <strong>${name}</strong> :`,
    );
    // Alerte dans l'espace des parents et des élèves qui ont un compte.
    const userIds = [...new Set(a.students.flatMap((s) => s.userIds))];
    await withTenant(tenantId, (tx) =>
      createStaffAlerts(tx, tenantId, userIds, {
        type: 'EXAM_REMINDER',
        title: `${a.session.label} commence dans ${REMINDER_DAYS} jours`,
        body: `Début le ${fmtDate(a.session.startDate)} — ${a.papers.length} épreuve(s).`,
        relatedType: RELATED_TYPE,
        relatedId: id,
      }),
    );
    sent += r.sent;
    skipped += r.skipped;
    done += 1;
  }
  return { sessions: done, sent, skipped };
}
