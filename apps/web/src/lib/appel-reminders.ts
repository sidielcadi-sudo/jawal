import 'server-only';
import { withTenant, prismaAdmin } from '@/lib/db';
import { dowOf, parseDateUTC } from '@/lib/lesson-book';
import { createTeacherMessage } from '@/lib/notify-teacher';

/** Délai de grâce (min) après le début du cours avant de relancer le prof. */
const GRACE_MIN = 10;

const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/**
 * Relance « appel non fait » d'un tenant : pour chaque séance d'EDT EN COURS
 * (début + 10 min ≤ maintenant ≤ fin) sans appel finalisé, envoie au prof un
 * message interne — une seule fois par séance/jour (table AppelReminder).
 * Calé sur l'heure locale du tenant. À déclencher par un cron intra-journée.
 */
export async function runAppelRemindersForTenant(
  tenantId: string,
): Promise<{ teachers: number; reminders: number }> {
  const tenant = await prismaAdmin.tenant.findUnique({
    where: { id: tenantId },
    select: { timezone: true },
  });
  const tz = tenant?.timezone || 'Africa/Casablanca';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const dateStr = `${get('year')}-${get('month')}-${get('day')}`;
  const nowMin = Number(get('hour')) * 60 + Number(get('minute'));
  const dow = dowOf(dateStr);
  const dateVal = parseDateUTC(dateStr);

  return withTenant(tenantId, async (tx) => {
    const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });
    if (!year) return { teachers: 0, reminders: 0 };

    const entries = await tx.timetableEntry.findMany({
      where: { academicYearId: year.id, dayOfWeek: dow, slot: { isBreak: false } },
      select: {
        id: true,
        classId: true,
        slot: { select: { startTime: true, endTime: true } },
        subject: { select: { label: true, labelAr: true } },
        class: { select: { name: true, nameAr: true } },
        teacher: {
          select: {
            userPersons: { select: { userId: true, user: { select: { disabledAt: true } } } },
          },
        },
      },
    });

    // Séances en cours : début + grâce ≤ maintenant ≤ fin.
    const ongoing = entries.filter((e) => {
      const start = toMin(e.slot.startTime) + GRACE_MIN;
      const end = toMin(e.slot.endTime);
      return nowMin >= start && nowMin <= end;
    });
    if (ongoing.length === 0) return { teachers: 0, reminders: 0 };

    const sessions = await tx.attendanceSession.findMany({
      where: { date: dateVal, finalizedAt: { not: null }, classId: { in: ongoing.map((e) => e.classId) } },
      select: { classId: true, periodLabel: true },
    });
    const finalizedSet = new Set(sessions.map((s) => `${s.classId}|${s.periodLabel ?? ''}`));

    const reminded = await tx.appelReminder.findMany({
      where: { date: dateVal, entryId: { in: ongoing.map((e) => e.id) } },
      select: { entryId: true },
    });
    const remindedSet = new Set(reminded.map((r) => r.entryId));

    // Expéditeur « système » = un compte direction / vie scolaire / admin actif.
    const sender = await tx.userRole.findFirst({
      where: {
        role: { code: { in: ['direction', 'tenant_admin', 'cpe'] } },
        user: { disabledAt: null },
      },
      select: { userId: true },
    });
    const senderId = sender?.userId ?? null;
    if (!senderId) return { teachers: 0, reminders: 0 };

    let reminders = 0;
    const teacherSet = new Set<string>();
    for (const e of ongoing) {
      const periodLabel = `${e.slot.startTime}-${e.slot.endTime}`;
      if (finalizedSet.has(`${e.classId}|${periodLabel}`)) continue;
      if (remindedSet.has(e.id)) continue;
      const teacherUserId =
        e.teacher?.userPersons.find((up) => up.user && !up.user.disabledAt)?.userId ?? null;
      if (!teacherUserId) continue;

      const subject = `Appel à faire — ${e.class.name}`;
      const body =
        `Bonjour,\n\nL'appel n'a pas encore été fait pour la classe ${e.class.name} ` +
        `(créneau ${e.slot.startTime}–${e.slot.endTime}` +
        (e.subject?.label ? `, ${e.subject.label}` : '') +
        `) aujourd'hui.\nMerci de le faire avant la fin du cours.\n\n— Vie scolaire`;
      try {
        await createTeacherMessage(tx, { tenantId, fromUserId: senderId, teacherUserId, subject, body });
        await tx.appelReminder.create({ data: { tenantId, entryId: e.id, date: dateVal } });
        reminders++;
        teacherSet.add(teacherUserId);
      } catch {
        // Collision unique (run concurrent) → déjà relancé, on ignore.
      }
    }
    return { teachers: teacherSet.size, reminders };
  });
}
