import 'server-only';
import type { Prisma } from '@/lib/db';

type Tx = Prisma.TransactionClient;

export type Schooling = {
  class: {
    id: string;
    name: string;
    nameAr: string | null;
    academicYearId: string;
    students: Array<{
      student: {
        id: string;
        firstName: string;
        lastName: string;
        firstNameAr: string | null;
        lastNameAr: string | null;
      };
    }>;
  };
  year: { id: string; label: string; active: boolean; startDate: Date; endDate: Date };
  periods: Array<{ id: string; label: string; kind: string; startDate: Date; endDate: Date }>;
  /** Vrai quand on a dû remonter à un exercice antérieur pour trouver un trimestre. */
  fallback: boolean;
};

/**
 * Scolarité à afficher pour un élève : sa classe, son année et ses trimestres.
 *
 * On vise l'année active. Mais une année sans trimestre ne permet ni notes ni
 * bilan d'assiduité par période — et c'est exactement l'état d'une année qui
 * vient d'ouvrir. Plutôt qu'un écran vide, on retombe alors sur le dernier
 * exercice où l'élève a une classe ET où les trimestres existent, en signalant
 * le décalage : voir les notes de l'an dernier est utile, croire qu'elles sont
 * de cette année ne l'est pas.
 */
export async function resolveStudentSchooling(
  tx: Tx,
  studentId: string,
): Promise<Schooling | null> {
  const rows = await tx.studentClass.findMany({
    where: { studentId },
    orderBy: { class: { academicYear: { startDate: 'desc' } } },
    select: {
      unenrolledAt: true,
      class: {
        select: {
          id: true,
          name: true,
          nameAr: true,
          academicYearId: true,
          academicYear: {
            select: { id: true, label: true, active: true, startDate: true, endDate: true },
          },
          students: {
            where: { unenrolledAt: null },
            select: {
              student: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  firstNameAr: true,
                  lastNameAr: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (rows.length === 0) return null;

  const periodsOf = (yearId: string) =>
    tx.period.findMany({
      where: { academicYearId: yearId },
      orderBy: { startDate: 'asc' },
      select: { id: true, label: true, kind: true, startDate: true, endDate: true },
    });

  // Priorité au rattachement en cours sur l'année active.
  const current =
    rows.find((r) => r.unenrolledAt === null && r.class.academicYear.active) ?? rows[0]!;
  const currentPeriods = await periodsOf(current.class.academicYearId);
  if (currentPeriods.length > 0) {
    const { academicYear, ...cls } = current.class;
    return { class: cls, year: academicYear, periods: currentPeriods, fallback: false };
  }

  // Repli : le plus récent exercice qui porte des trimestres.
  for (const r of rows) {
    if (r.class.academicYearId === current.class.academicYearId) continue;
    const periods = await periodsOf(r.class.academicYearId);
    if (periods.length > 0) {
      const { academicYear, ...cls } = r.class;
      return { class: cls, year: academicYear, periods, fallback: true };
    }
  }

  // Aucun exercice n'a de trimestre : on rend quand même la classe courante,
  // l'écran dira ce qui manque plutôt que de disparaître.
  const { academicYear, ...cls } = current.class;
  return { class: cls, year: academicYear, periods: [], fallback: false };
}
