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
 * Enregistre les couleurs du thème de l'établissement (`tenant.settings.theme`) :
 *  - `primary` : couleur principale (pilote la palette brand 50→900) ;
 *  - `band` : fond des bandes de titre (défaut : suit brand-100) ;
 *  - `tableHeader` : fond des en-têtes de tableau (défaut : #A9EAFE).
 * Une valeur vide = retour au défaut pour cette couleur. Toutes vides → thème par défaut.
 */
export async function saveThemeAction(
  primary: string,
  band = '',
  tableHeader = '',
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  const values = {
    primary: (primary ?? '').trim(),
    band: (band ?? '').trim(),
    tableHeader: (tableHeader ?? '').trim(),
  };
  for (const v of Object.values(values)) {
    if (v && !isValidHex(v)) return { ok: false, error: 'Couleur invalide (format #RRGGBB attendu).' };
  }
  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const tenant = await tx.tenant.findFirstOrThrow({ select: { id: true, settings: true } });
      const settings = { ...((tenant.settings as Record<string, unknown>) ?? {}) };
      const theme: Record<string, string> = {};
      for (const [k, v] of Object.entries(values)) if (v) theme[k] = v;
      if (Object.keys(theme).length > 0) settings.theme = theme;
      else delete settings.theme;
      await tx.tenant.update({ where: { id: tenant.id }, data: { settings: settings as Prisma.InputJsonValue } });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'update',
        entityType: 'Tenant',
        entityId: tenant.id,
        after: { theme: Object.keys(theme).length ? theme : 'default' },
      });
    });
    // Le thème est injecté dans le layout racine → revalider tout l'arbre.
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
