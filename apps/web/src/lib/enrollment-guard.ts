/**
 * Garde « dossier archivé » : un dossier radié/archivé (« Historique ») reste
 * consultable mais n'est plus modifiable. À appeler en tête des actions
 * d'écriture qui portent sur un dossier d'inscription.
 */
import type { Prisma } from '@jawal/db';

export async function assertEnrollmentNotArchived(
  tx: Prisma.TransactionClient,
  enrollmentId: string,
): Promise<void> {
  const e = await tx.enrollment.findUnique({
    where: { id: enrollmentId },
    select: { archivedAt: true },
  });
  if (e?.archivedAt) throw new Error('Dossier archivé (Historique), non modifiable.');
}
