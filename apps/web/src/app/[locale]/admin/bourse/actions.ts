'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { DEFAULT_BOOK_CONFIG } from '@/lib/book-defaults';

type Result = { ok: true; id?: string } | { ok: false; error: string };

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

// ── Config ─────────────────────────────────────────────────────
export async function seedBookConfigAction(): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const tenantId = s.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    const exists = await tx.bookExchangeConfig.count();
    if (exists > 0) return;
    await tx.bookExchangeConfig.create({ data: { tenantId, ...DEFAULT_BOOK_CONFIG } });
  });
  revalidatePath('/admin/bourse');
  return { ok: true };
}

export async function updateBookConfigAction(fd: FormData): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const id = str(fd, 'id');
  if (!id) return { ok: false, error: 'Config introuvable.' };
  const pricingByCondition = {
    NEW: num(fd, 'p_NEW') ?? 0.8,
    VERY_GOOD: num(fd, 'p_VERY_GOOD') ?? 0.6,
    GOOD: num(fd, 'p_GOOD') ?? 0.5,
    FAIR: num(fd, 'p_FAIR') ?? 0.35,
  };
  await withTenant(s.user.tenantId, (tx) =>
    tx.bookExchangeConfig.update({
      where: { id },
      data: {
        commissionMode: (str(fd, 'commissionMode') as 'PERCENT' | 'FIXED') ?? 'PERCENT',
        commissionValue: num(fd, 'commissionValue') ?? 0,
        labelPrefix: str(fd, 'labelPrefix') ?? 'BRS',
        pricingByCondition,
      },
    }),
  );
  revalidatePath('/admin/bourse');
  return { ok: true };
}

// ── Campagnes ──────────────────────────────────────────────────
export async function createCampaignAction(fd: FormData): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const label = str(fd, 'label');
  const year = num(fd, 'year');
  if (!label || !year) return { ok: false, error: 'Libellé et année requis.' };
  await withTenant(s.user.tenantId, (tx) => tx.bookExchangeCampaign.create({ data: { tenantId: s.user.tenantId, label, year } }));
  revalidatePath('/admin/bourse');
  return { ok: true };
}

export async function setCampaignStatusAction(id: string, status: 'OPEN' | 'CLOSED'): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  await withTenant(s.user.tenantId, async (tx) => {
    await tx.bookExchangeCampaign.update({ where: { id }, data: { status } });
    await logAudit(tx, { tenantId: s.user.tenantId, userId: s.user.id, action: 'campaign_status', entityType: 'BookExchangeCampaign', entityId: id, after: { status } });
  });
  revalidatePath('/admin/bourse');
  return { ok: true };
}

// ── Catalogue (Book) ───────────────────────────────────────────
export async function createBookAction(fd: FormData): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const title = str(fd, 'title');
  if (!title) return { ok: false, error: 'Titre requis.' };
  const book = await withTenant(s.user.tenantId, (tx) =>
    tx.book.create({
      data: {
        tenantId: s.user.tenantId,
        title,
        subjectId: str(fd, 'subjectId') ?? null,
        levelId: str(fd, 'levelId') ?? null,
        editor: str(fd, 'editor') ?? null,
        isbn: str(fd, 'isbn') ?? null,
        editionYear: num(fd, 'editionYear') ? Math.round(num(fd, 'editionYear')!) : null,
        priceNew: num(fd, 'priceNew') ?? 0,
        priceBourseDefault: num(fd, 'priceBourseDefault') ?? null,
      },
      select: { id: true },
    }),
  );
  revalidatePath('/admin/bourse');
  return { ok: true, id: book.id };
}

export async function deleteBookAction(id: string): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  try {
    await withTenant(s.user.tenantId, async (tx) => {
      const copies = await tx.bookCopy.count({ where: { bookId: id } });
      if (copies > 0) throw new Error('Des exemplaires existent — impossible de supprimer ce titre.');
      await tx.book.delete({ where: { id } });
    });
    revalidatePath('/admin/bourse');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
