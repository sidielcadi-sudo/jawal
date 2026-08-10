'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant, prismaAdmin } from '@/lib/db';

type Result = { ok: true } | { ok: false; error: string };

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  localeDefault: z.enum(['fr', 'ar']),
  currency: z.string().trim().min(1).max(8),
  timezone: z.string().trim().min(1).max(64),
  // Code établissement MASSAR : facultatif, mais unique en base — il sert de
  // filtre à l'import MASSAR. Vide = aucun filtrage.
  massarCode: z
    .string()
    .trim()
    .max(32)
    .transform((v) => (v === '' ? null : v.toUpperCase()))
    .nullable(),
});

/**
 * Met à jour l'identité de l'établissement (nom, locale par défaut, devise,
 * fuseau). Réservé au `tenant_admin` (permission `tenants.manage`). La mise à
 * jour du tenant passe par `prismaAdmin` (table tenant), scoping strict sur le
 * tenant de la session.
 */
export async function updateEstablishmentAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' ? v.trim() : '';
  };
  const parsed = schema.safeParse({
    name: get('name'),
    localeDefault: get('localeDefault'),
    currency: get('currency'),
    timezone: get('timezone'),
    massarCode: get('massarCode'),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };

  const tenantId = session.user.tenantId;
  try {
    // Le code MASSAR est unique tous établissements confondus : on rend le
    // conflit explicite plutôt que de laisser remonter une erreur Prisma.
    if (parsed.data.massarCode) {
      const clash = await prismaAdmin.tenant.findFirst({
        where: { massarCode: parsed.data.massarCode, id: { not: tenantId } },
        select: { name: true },
      });
      if (clash) {
        return {
          ok: false,
          error: `Le code « ${parsed.data.massarCode} » est déjà utilisé par « ${clash.name} ».`,
        };
      }
    }
    const before = await prismaAdmin.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, localeDefault: true, currency: true, timezone: true, massarCode: true },
    });
    await prismaAdmin.tenant.update({ where: { id: tenantId }, data: parsed.data });
    await withTenant(tenantId, async (tx) => {
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'update',
        entityType: 'Tenant',
        entityId: tenantId,
        before: before ?? undefined,
        after: parsed.data,
      });
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
  revalidatePath('/admin/settings/establishment');
  return { ok: true };
}
