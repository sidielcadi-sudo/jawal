'use server';

import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { parentCanAccessChild } from '@/lib/parent';

type Result = { ok: true } | { ok: false; error: string };

/**
 * Marque comme lues toutes les entrées de carnet visibles non encore lues de
 * l'enfant (« Vu le » = maintenant). Appelée au montage de la vue parent.
 */
export async function markCarnetReadAction(childId: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      if (!(await parentCanAccessChild(tx, session.user.id, childId)))
        throw new Error('Accès refusé.');
      await tx.carnetEntry.updateMany({
        where: { studentId: childId, visibleToParents: true, parentReadAt: null },
        data: { parentReadAt: new Date() },
      });
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
