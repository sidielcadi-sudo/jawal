import { withTenant } from '@/lib/db';
import { verifyMobileParent } from '@/lib/mobile-auth';
import { loadParentChildContext } from '@/lib/parent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

/**
 * GET /api/mobile/children/[childId]/soutien
 * → cours de soutien suivis par l'enfant + séances (date, heure, prof, thème,
 *   présence, appréciation, ressources) — rapport de suivi côté parent.
 */
export async function GET(req: Request, ctx: { params: Promise<{ childId: string }> }) {
  const { childId } = await ctx.params;
  const principal = await verifyMobileParent(req);
  if (!principal) return Response.json({ error: 'Non authentifié.' }, { status: 401 });

  const data = await withTenant(principal.tenantId, async (tx) => {
    const child = await loadParentChildContext(tx, principal.userId, childId);
    if (!child) return 'forbidden' as const;

    const enrollments = await tx.supportEnrollment.findMany({
      where: { studentId: childId, status: 'ACTIVE', unenrolledAt: null },
      select: {
        supportCourseId: true,
        course: {
          select: {
            title: true,
            subjectId: true,
            teacherId: true,
            slots: { select: { dayOfWeek: true, startTime: true, endTime: true } },
          },
        },
      },
    });
    if (!enrollments.length) return { courses: [] };

    const subjectIds = [...new Set(enrollments.map((e) => e.course.subjectId))];
    const subjects = await tx.subject.findMany({ where: { id: { in: subjectIds } }, select: { id: true, label: true } });
    const subjById = new Map(subjects.map((s) => [s.id, s.label]));
    const teacherIds = [...new Set(enrollments.map((e) => e.course.teacherId).filter((x): x is string => !!x))];
    const teachers = teacherIds.length
      ? await tx.person.findMany({ where: { id: { in: teacherIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const teacherById = new Map(teachers.map((p) => [p.id, `${p.lastName} ${p.firstName}`]));
    const courseIds = enrollments.map((e) => e.supportCourseId);
    const sessions = await tx.supportSession.findMany({ where: { supportCourseId: { in: courseIds } }, orderBy: { date: 'desc' }, select: { id: true, supportCourseId: true, date: true, topic: true } });
    const attendance = await tx.supportAttendance.findMany({ where: { studentId: childId, session: { supportCourseId: { in: courseIds } } }, select: { sessionId: true, present: true, appreciation: true } });
    const attBySession = new Map(attendance.map((a) => [a.sessionId, a]));
    const resList = sessions.length
      ? await tx.supportResource.findMany({ where: { supportSessionId: { in: sessions.map((s) => s.id) } }, orderBy: { createdAt: 'desc' }, select: { id: true, title: true, url: true, supportSessionId: true } })
      : [];
    const resBySession = new Map<string, { id: string; title: string; url: string }[]>();
    for (const r of resList) {
      const arr = resBySession.get(r.supportSessionId!) ?? [];
      arr.push({ id: r.id, title: r.title, url: r.url });
      resBySession.set(r.supportSessionId!, arr);
    }

    const courses = enrollments.map((e) => {
      const slots = e.course.slots;
      return {
        courseTitle: e.course.title,
        subject: subjById.get(e.course.subjectId) ?? '—',
        teacher: e.course.teacherId ? teacherById.get(e.course.teacherId) ?? null : null,
        sessions: sessions
          .filter((se) => se.supportCourseId === e.supportCourseId)
          .map((se) => {
            const a = attBySession.get(se.id);
            const dow = DOW[se.date.getUTCDay()];
            const slot = slots.find((sl) => sl.dayOfWeek === dow) ?? slots[0];
            return {
              date: se.date.toISOString().slice(0, 10),
              time: slot ? `${slot.startTime}${slot.endTime ? `–${slot.endTime}` : ''}` : null,
              topic: se.topic,
              present: a?.present ?? null,
              appreciation: a?.appreciation ?? null,
              resources: resBySession.get(se.id) ?? [],
            };
          }),
      };
    });
    return { courses };
  });

  if (data === 'forbidden') return Response.json({ error: 'Accès refusé.' }, { status: 403 });
  return Response.json(data);
}
