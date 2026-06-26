'use server';

import { revalidatePath } from 'next/cache';
import { auth, unstable_update } from '@/lib/auth';

/**
 * Bascule le site actif d'un compte multi-établissements. La garde d'appartenance
 * est faite ici (session.user.sites) ET dans le callback jwt (token.sites).
 */
export async function switchSiteAction(tenantId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  if (!session.user.sites.some((s) => s.tenantId === tenantId))
    return { ok: false, error: 'Site non autorisé.' };

  await unstable_update({ activeTenantId: tenantId } as never);
  revalidatePath('/', 'layout');
  return { ok: true };
}
