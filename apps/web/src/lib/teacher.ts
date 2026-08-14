import 'server-only';
import type { Prisma } from '@/lib/db';

type Tx = Prisma.TransactionClient;

/**
 * Résout la personne (type TEACHER) rattachée à un compte enseignant via
 * `UserPerson`. Renvoie null si le compte n'est lié à aucun enseignant.
 * À appeler dans un `withTenant`.
 */
export async function getTeacherPersonId(tx: Tx, userId: string): Promise<string | null> {
  const link = await tx.userPerson.findFirst({
    where: { userId, person: { type: 'TEACHER' } },
    select: { personId: true },
  });
  return link?.personId ?? null;
}

/**
 * Vrai si l'enseignant est celui affecté à ce cours de soutien. Garde d'accès
 * du portail enseignant : un prof ne voit et ne saisit que ses propres cours.
 * À appeler dans un `withTenant`.
 */
export async function teacherOwnsSupportCourse(
  tx: Tx,
  teacherId: string,
  courseId: string,
): Promise<boolean> {
  const course = await tx.supportCourse.findFirst({
    where: { id: courseId, teacherId },
    select: { id: true },
  });
  return Boolean(course);
}

/** Idem, à partir d'une séance plutôt que du cours. */
export async function teacherOwnsSupportSession(
  tx: Tx,
  teacherId: string,
  sessionId: string,
): Promise<boolean> {
  const sess = await tx.supportSession.findFirst({
    where: { id: sessionId, course: { teacherId } },
    select: { id: true },
  });
  return Boolean(sess);
}

/**
 * Vrai si l'enseignant enseigne bien cette matière dans cette classe sur
 * l'année active — via une affectation (`TeacherAssignment`) OU une case d'EDT
 * (`TimetableEntry`). Garde d'accès pour la saisie des notes côté prof.
 * À appeler dans un `withTenant`.
 */
export async function teacherTeachesClassSubject(
  tx: Tx,
  teacherId: string,
  classId: string,
  subjectId: string,
): Promise<boolean> {
  const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });
  if (!year) return false;
  const [assignment, entry] = await Promise.all([
    tx.teacherAssignment.findFirst({
      where: { teacherId, classId, subjectId, academicYearId: year.id },
      select: { id: true },
    }),
    tx.timetableEntry.findFirst({
      where: { teacherId, classId, subjectId, academicYearId: year.id },
      select: { id: true },
    }),
  ]);
  return Boolean(assignment || entry);
}
