import 'server-only';
import { headers } from 'next/headers';
import type { Prisma, PrismaClient } from '@jawal/db';

export type AuditAction = 'create' | 'update' | 'delete' | 'restore' | string;

/**
 * Capture l'IP et l'User-Agent de la requête en cours pour traçabilité.
 * À appeler dans un Server Component ou Server Action.
 */
export async function captureRequestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  return {
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: h.get('user-agent') ?? null,
  };
}

type AuditTx = PrismaClient | Prisma.TransactionClient;

export async function logAudit(
  tx: AuditTx,
  params: {
    tenantId: string;
    userId: string | null;
    action: AuditAction;
    entityType: string;
    entityId?: string | null;
    before?: unknown;
    after?: unknown;
  },
): Promise<void> {
  const meta = await captureRequestMeta();
  await tx.auditLog.create({
    data: {
      tenantId: params.tenantId,
      userId: params.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      before: (params.before ?? null) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
      after: (params.after ?? null) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
  });
}
