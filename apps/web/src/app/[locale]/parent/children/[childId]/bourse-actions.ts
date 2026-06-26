'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { parentCanAccessChild } from '@/lib/parent';

type Result = { ok: true } | { ok: false; error: string };

/** Réserve un exemplaire disponible pour l'enfant (FOR_SALE → RESERVED). */
export async function reserveCopyAction(copyId: string, childId: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  const tenantId = session.user.tenantId;
  try {
    return await withTenant(tenantId, async (tx): Promise<Result> => {
      if (!(await parentCanAccessChild(tx, session.user.id, childId))) return { ok: false, error: 'Accès refusé.' };
      const copy = await tx.bookCopy.findUnique({ where: { id: copyId }, select: { status: true } });
      if (!copy) return { ok: false, error: 'Exemplaire introuvable.' };
      if (copy.status !== 'FOR_SALE') return { ok: false, error: 'Cet exemplaire n’est plus disponible.' };
      await tx.bookCopy.update({ where: { id: copyId }, data: { status: 'RESERVED', buyerId: childId } });
      return { ok: true };
    }).then((r) => { revalidatePath(`/parent/children/${childId}/bourse`); return r; });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/** Annule la réservation de l'enfant (RESERVED → FOR_SALE). */
export async function cancelReservationAction(copyId: string, childId: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  const tenantId = session.user.tenantId;
  try {
    return await withTenant(tenantId, async (tx): Promise<Result> => {
      if (!(await parentCanAccessChild(tx, session.user.id, childId))) return { ok: false, error: 'Accès refusé.' };
      const copy = await tx.bookCopy.findUnique({ where: { id: copyId }, select: { status: true, buyerId: true } });
      if (!copy || copy.status !== 'RESERVED' || copy.buyerId !== childId) return { ok: false, error: 'Réservation introuvable.' };
      await tx.bookCopy.update({ where: { id: copyId }, data: { status: 'FOR_SALE', buyerId: null } });
      return { ok: true };
    }).then((r) => { revalidatePath(`/parent/children/${childId}/bourse`); return r; });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
