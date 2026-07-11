/**
 * Alertes in-app destinées au personnel (la cloche de l'en-tête admin).
 * Distinct des `NotificationLog` (sortants WhatsApp/SMS/e-mail vers les parents) :
 * ces alertes sont internes et rattachées à un utilisateur (`StaffAlert`).
 */
import type { Prisma } from '@jawal/db';

export type StaffAlertInput = {
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  relatedType?: string | null;
  relatedId?: string | null;
};

/** Résout les utilisateurs du tenant portant l'un des codes de rôle donnés. */
export async function usersWithRoleCode(
  tx: Prisma.TransactionClient,
  tenantId: string,
  codes: string[],
): Promise<string[]> {
  const rows = await tx.userRole.findMany({
    where: { tenantId, role: { code: { in: codes } } },
    select: { userId: true },
  });
  return [...new Set(rows.map((r) => r.userId))];
}

/** Crée une alerte pour chaque destinataire (déduplique les userId). */
export async function createStaffAlerts(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userIds: string[],
  data: StaffAlertInput,
): Promise<void> {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return;
  await tx.staffAlert.createMany({
    data: unique.map((userId) => ({
      tenantId,
      userId,
      type: data.type,
      title: data.title,
      body: data.body ?? null,
      link: data.link ?? null,
      relatedType: data.relatedType ?? null,
      relatedId: data.relatedId ?? null,
    })),
  });
}

/**
 * Crée une alerte pour tous les utilisateurs portant l'un des rôles donnés.
 * Combine `usersWithRoleCode` + `createStaffAlerts`.
 */
export async function alertRole(
  tx: Prisma.TransactionClient,
  tenantId: string,
  codes: string[],
  data: StaffAlertInput,
): Promise<void> {
  const userIds = await usersWithRoleCode(tx, tenantId, codes);
  await createStaffAlerts(tx, tenantId, userIds, data);
}
