import type { Prisma } from '@jawal/db';

type Tx = Prisma.TransactionClient;

/**
 * Début de l'année scolaire active.
 *
 * Les messages, annonces et alertes affichés — parents, élèves, enseignants,
 * administration, vie scolaire, secrétariat — sont ceux de l'année active :
 * ceux d'un exercice clos encombrent les listes et les compteurs de non-lus.
 * Null sans année active : on n'invente pas de borne.
 */
export async function activeYearStart(tx: Tx): Promise<Date | null> {
  const year = await tx.academicYear.findFirst({
    where: { active: true },
    select: { startDate: true },
  });
  return year?.startDate ?? null;
}
