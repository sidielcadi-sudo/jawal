'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { suggestedBoursePrice } from '@/lib/book-defaults';

type Result = { ok: true } | { ok: false; error: string };

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
};
const num = (fd: FormData, k: string) => {
  const v = str(fd, k);
  return v !== undefined ? Number(v) : undefined;
};

async function guard() {
  const session = await auth();
  if (!session?.user) return null;
  await requirePermission('students.write');
  return session;
}

const CONDITIONS = ['NEW', 'VERY_GOOD', 'GOOD', 'FAIR'] as const;

/** Dépose un exemplaire (occasion) : génère un code unique + prix (auto si vide) + entre en vente. */
export async function addCopyAction(fd: FormData): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const tenantId = s.user.tenantId;
  const campaignId = str(fd, 'campaignId');
  const sellerId = str(fd, 'sellerId');
  const bookId = str(fd, 'bookId');
  const condition = str(fd, 'condition') as (typeof CONDITIONS)[number] | undefined;
  if (!campaignId || !sellerId || !bookId || !condition || !CONDITIONS.includes(condition))
    return { ok: false, error: 'Campagne, élève, livre et état requis.' };

  try {
    await withTenant(tenantId, async (tx) => {
      const campaign = await tx.bookExchangeCampaign.findUnique({ where: { id: campaignId }, select: { year: true, status: true } });
      if (!campaign) throw new Error('Campagne introuvable.');
      if (campaign.status === 'CLOSED') throw new Error('Campagne clôturée.');
      const config = await tx.bookExchangeConfig.findFirst();
      const book = await tx.book.findUnique({ where: { id: bookId }, select: { priceNew: true, priceBourseDefault: true } });
      if (!book) throw new Error('Livre introuvable.');

      const factors = (config?.pricingByCondition as Record<string, number>) ?? {};
      const askPrice =
        num(fd, 'askPrice') ?? book.priceBourseDefault ?? suggestedBoursePrice(book.priceNew, condition, factors);

      const prefix = config?.labelPrefix ?? 'BRS';
      const seq = (await tx.bookCopy.count()) + 1;
      const code = `${prefix}-${campaign.year}-${String(seq).padStart(5, '0')}`;

      const copy = await tx.bookCopy.create({
        data: { tenantId, campaignId, bookId, sellerId, condition, source: 'STUDENT_USED', askPrice, status: 'FOR_SALE', code },
      });
      await logAudit(tx, { tenantId, userId: s.user.id, action: 'deposit_copy', entityType: 'BookCopy', entityId: copy.id, after: { code, askPrice } });
    });
    revalidatePath('/admin/bourse/depot');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/** Retire un exemplaire déposé (tant qu'il n'est pas vendu). */
export async function removeCopyAction(copyId: string): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  try {
    await withTenant(s.user.tenantId, async (tx) => {
      const c = await tx.bookCopy.findUnique({ where: { id: copyId }, select: { status: true } });
      if (!c) throw new Error('Introuvable.');
      if (c.status === 'SOLD' || c.status === 'REFUNDED') throw new Error('Exemplaire vendu — non supprimable.');
      await tx.bookCopy.delete({ where: { id: copyId } });
    });
    revalidatePath('/admin/bourse/depot');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
