import 'server-only';
import type { CarnetEvent } from '@/lib/carnet';
import { loadCarnetEventsForStudents } from '@/lib/carnet';

export type CarnetSearchScope = {
  levelId: string | null;
  classId: string | null;
  studentId: string | null;
  /** Bornes incluses ; null = pas de borne de ce côté. */
  from: Date | null;
  to: Date | null;
};

/**
 * Résout les élèves visés par une recherche du carnet.
 *
 * L'ordre de précision compte : un élève désigné l'emporte sur la classe, qui
 * l'emporte sur le niveau. Sans aucun des trois, on ne retourne rien plutôt que
 * l'établissement entier — une recherche non bornée n'a pas de sens ici et
 * coûterait cher.
 */
export async function searchCarnetEvents(
  tx: Parameters<typeof loadCarnetEventsForStudents>[0],
  scope: CarnetSearchScope,
): Promise<CarnetEvent[]> {
  const students = await tx.person.findMany({
    where: {
      type: 'STUDENT',
      deletedAt: null,
      ...(scope.studentId
        ? { id: scope.studentId }
        : scope.classId
          ? { studentClasses: { some: { classId: scope.classId, unenrolledAt: null } } }
          : scope.levelId
            ? {
                studentClasses: {
                  some: { unenrolledAt: null, class: { levelId: scope.levelId, deletedAt: null } },
                },
              }
            : { id: '00000000-0000-0000-0000-000000000000' }),
    },
    select: { id: true, firstName: true, lastName: true, firstNameAr: true, lastNameAr: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });
  if (students.length === 0) return [];
  return loadCarnetEventsForStudents(tx, students, { from: scope.from, to: scope.to });
}
