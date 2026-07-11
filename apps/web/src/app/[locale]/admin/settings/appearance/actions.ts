'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { withTenant } from '@/lib/db';
import type { Prisma } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { isValidHex } from '@/lib/theme';

type Result = { ok: true } | { ok: false; error: string };

/**
 * Enregistre la couleur primaire du thème de l'établissement
 * (`tenant.settings.theme.primary`). Valeur vide → retour au thème par défaut.
 */
export async function saveThemeAction(primary: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  const value = (primary ?? '').trim();
  if (value && !isValidHex(value)) return { ok: false, error: 'Couleur invalide (format #RRGGBB attendu).' };
  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const tenant = await tx.tenant.findFirstOrThrow({ select: { id: true, settings: true } });
      const settings = { ...((tenant.settings as Record<string, unknown>) ?? {}) };
      if (value) settings.theme = { ...((settings.theme as Record<string, unknown>) ?? {}), primary: value };
      else delete settings.theme;
      await tx.tenant.update({ where: { id: tenant.id }, data: { settings: settings as Prisma.InputJsonValue } });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'update',
        entityType: 'Tenant',
        entityId: tenant.id,
        after: { themePrimary: value || 'default' },
      });
    });
    // Le thème est injecté dans le layout racine → revalider tout l'arbre.
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
