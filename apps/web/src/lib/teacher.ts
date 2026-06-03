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
