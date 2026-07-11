'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { DEFAULT_CHART } from '@/lib/cgnc-accounts';
import { postEntry, type PostLine } from '@/lib/accounting';

type Result = { ok: true; message?: string } | { ok: false; error: string };

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
};

async function guard() {
  const session = await auth();
  if (!session?.user) return null;
  await requirePermission('tenants.manage');
  return session;
}

/** Crée le plan comptable CGNC par défaut (idempotent). */
export async function seedChartAction(): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const tenantId = s.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    for (const a of DEFAULT_CHART) {
      await tx.account.upsert({
        where: { tenantId_code: { tenantId, code: a.code } },
        create: { tenantId, code: a.code, name: a.name, reconcilable: !!a.r },
        update: {},
      });
    }
  });
  revalidatePath('/admin/comptabilite');
  return { ok: true };
}

export async function createAccountAction(fd: FormData): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const code = str(fd, 'code');
  const name = str(fd, 'name');
  if (!code || !name) return { ok: false, error: 'Code et libellé requis.' };
  try {
    await withTenant(s.user.tenantId, (tx) =>
      tx.account.create({ data: { tenantId: s.user.tenantId, code, name, reconcilable: fd.get('reconcilable') === 'on' } }),
    );
  } catch {
    return { ok: false, error: 'Ce code de compte existe déjà.' };
  }
  revalidatePath('/admin/comptabilite');
  return { ok: true };
}

export async function createFiscalYearAction(fd: FormData): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const label = str(fd, 'label');
  const start = str(fd, 'startDate');
  const end = str(fd, 'endDate');
  if (!label || !start || !end) return { ok: false, error: 'Libellé et dates requis.' };
  await withTenant(s.user.tenantId, (tx) =>
    tx.fiscalYear.create({ data: { tenantId: s.user.tenantId, label, startDate: new Date(`${start}T00:00:00Z`), endDate: new Date(`${end}T00:00:00Z`) } }),
  );
  revalidatePath('/admin/comptabilite');
  return { ok: true };
}

/** Saisie manuelle d'une écriture (journal OD par défaut) — équilibre validé. */
export async function createManualEntryAction(input: {
  journal: 'VE' | 'AC' | 'BQ' | 'CA' | 'PA' | 'OD';
  date: string;
  label: string;
  reference?: string;
  lines: { accountCode: string; debit?: number; credit?: number; label?: string }[];
}): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  if (!input.label?.trim()) return { ok: false, error: 'Libellé requis.' };
  const lines: PostLine[] = (input.lines ?? []).filter((l) => l.accountCode && ((l.debit ?? 0) > 0 || (l.credit ?? 0) > 0));
  if (lines.length < 2) return { ok: false, error: 'Au moins deux lignes mouvementées.' };
  try {
    const res = await withTenant(s.user.tenantId, (tx) =>
      postEntry(tx, s.user.tenantId, {
        journal: input.journal,
        date: new Date(`${input.date}T00:00:00Z`),
        label: input.label.trim(),
        reference: input.reference,
        lines,
        postedByUserId: s.user.id,
      }),
    );
    if (!res) return { ok: false, error: 'Aucun exercice ouvert pour cette date.' };
    revalidatePath('/admin/comptabilite/journal');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/** Contre-passe une écriture (crée l'écriture inverse) — pour corriger une écriture automatique. */
export async function reverseEntryAction(id: string): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const tenantId = s.user.tenantId;
  try {
    const res = await withTenant(tenantId, async (tx) => {
      const entry = await tx.journalEntry.findUnique({ where: { id }, include: { lines: { include: { account: { select: { code: true } } } } } });
      if (!entry) throw new Error('Introuvable.');
      if (entry.sourceType === 'Reversal') throw new Error('Une contre-passation ne se contre-passe pas.');
      const lines = entry.lines.map((l) => ({ accountCode: l.account.code, debit: Number(l.credit), credit: Number(l.debit), label: l.label ?? undefined }));
      const r = await postEntry(tx, tenantId, { journal: 'OD', date: new Date(), label: `Contre-passation — ${entry.label}`, sourceType: 'Reversal', sourceId: id, postedByUserId: s.user.id, lines });
      await logAudit(tx, { tenantId, userId: s.user.id, action: 'reverse_entry', entityType: 'JournalEntry', entityId: id });
      return r;
    });
    if (!res) return { ok: false, error: 'Aucun exercice ouvert pour la date du jour.' };
    revalidatePath('/admin/comptabilite/journal');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/** Supprime une écriture SAISIE MANUELLEMENT (pas une écriture postée par un module). */
export async function deleteEntryAction(id: string): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  try {
    await withTenant(s.user.tenantId, async (tx) => {
      const e = await tx.journalEntry.findUnique({ where: { id }, select: { sourceType: true } });
      if (!e) throw new Error('Introuvable.');
      if (e.sourceType) throw new Error('Écriture automatique — contre-passer plutôt que supprimer.');
      await tx.journalEntry.delete({ where: { id } });
      await logAudit(tx, { tenantId: s.user.tenantId, userId: s.user.id, action: 'delete_entry', entityType: 'JournalEntry', entityId: id });
    });
    revalidatePath('/admin/comptabilite/journal');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
