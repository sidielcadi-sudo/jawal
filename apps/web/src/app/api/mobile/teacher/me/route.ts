import { withTenant } from '@/lib/db';
import { verifyMobileTeacher, unauthorized } from '@/lib/mobile-teacher';
import { getTeacherPersonId } from '@/lib/teacher';
import { countMissingAppels } from '@/lib/teacher-attendance';
import { countUnreadConversations } from '@/lib/messaging';
import { presignedGet } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/mobile/teacher/me
 * → identité du professeur, ses classes et matières, et les compteurs qui
 *   ouvrent l'accueil de l'app (appels à faire, messages non lus).
 */
export async function GET(req: Request) {
  const principal = await verifyMobileTeacher(req);
  if (!principal) return unauthorized();

  const tz =
    (await withTenant(principal.tenantId, (tx) => tx.tenant.findFirst({ select: { timezone: true } })))
      ?.timezone || 'Africa/Casablanca';

  const data = await withTenant(principal.tenantId, async (tx) => {
    const teacherId = await getTeacherPersonId(tx, principal.userId);
    if (!teacherId) return null;

    const person = await tx.person.findUnique({
      where: { id: teacherId },
      select: { firstName: true, lastName: true, photoFile: { select: { s3Key: true } } },
    });
    const year = await tx.academicYear.findFirst({
      where: { active: true },
      select: { id: true, label: true },
    });

    const select = {
      classId: true,
      subjectId: true,
      class: { select: { name: true } },
      subject: { select: { label: true } },
    } as const;
    const [assignments, entries] = year
      ? await Promise.all([
          tx.teacherAssignment.findMany({ where: { teacherId, academicYearId: year.id }, select }),
          tx.timetableEntry.findMany({ where: { teacherId, academicYearId: year.id }, select }),
        ])
      : [[], []];

    // Un « service » = un couple classe × matière : c'est l'unité de travail du
    // prof, aussi bien pour l'appel que pour les notes.
    const services = new Map<string, { classId: string; className: string; subjectId: string; subjectLabel: string }>();
    for (const a of [...assignments, ...entries]) {
      if (!a.subjectId) continue;
      const key = `${a.classId}|${a.subjectId}`;
      if (services.has(key)) continue;
      services.set(key, {
        classId: a.classId,
        className: a.class.name,
        subjectId: a.subjectId,
        subjectLabel: a.subject?.label ?? '—',
      });
    }

    let photoUrl: string | null = null;
    if (person?.photoFile) {
      try {
        photoUrl = await presignedGet(person.photoFile.s3Key, 15 * 60);
      } catch {
        photoUrl = null;
      }
    }

    return {
      teacher: {
        id: teacherId,
        firstName: person?.firstName ?? '',
        lastName: person?.lastName ?? '',
        photoUrl,
      },
      yearLabel: year?.label ?? null,
      services: [...services.values()].sort(
        (a, b) => a.className.localeCompare(b.className) || a.subjectLabel.localeCompare(b.subjectLabel),
      ),
      missingAppels: await countMissingAppels(tx, tz, { teacherId }),
    };
  });

  if (!data) return Response.json({ error: 'Profil enseignant introuvable.' }, { status: 404 });

  const unreadMessages = await withTenant(principal.tenantId, (tx) =>
    countUnreadConversations(tx, principal.userId),
  );
  return Response.json({ ...data, unreadMessages });
}
