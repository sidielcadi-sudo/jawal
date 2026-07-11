'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { postEntry } from '@/lib/accounting';
import { accountClass } from '@/lib/cgnc-accounts';

type Result = { ok: true; message?: string } | { ok: false; error: string };
const RESULT_ACCOUNT = '1191';

async function guard() {
  const session = await auth();
  if (!session?.user) return null;
  await requirePermission('tenants.manage');
  return session;
}

/**
 * Clôture un exercice : reporte les soldes des comptes de bilan (classes 1–5) +
 * le résultat (classes 7−6 → 1191) en À-NOUVEAUX de l'exercice suivant, puis
 * passe l'exercice en CLOSED (plus aucune écriture possible — postEntry l'ignore).
 */
export async function closeFiscalYearAction(yearId: string): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const tenantId = s.user.tenantId;
  try {
    return await withTenant(tenantId, async (tx): Promise<Result> => {
      const year = await tx.fiscalYear.findUnique({ where: { id: yearId } });
      if (!year) return { ok: false, error: 'Exercice introuvable.' };
      if (year.status === 'CLOSED') return { ok: false, error: 'Exercice déjà clôturé.' };

      const next = await tx.fiscalYear.findFirst({
        where: { tenantId, status: 'OPEN', startDate: { gte: year.endDate }, id: { not: yearId } },
        orderBy: { startDate: 'asc' },
      });
      if (!next) return { ok: false, error: 'Créez d’abord l’exercice suivant (ouvert).' };

      // Soldes par compte sur cet exercice.
      const entries = await tx.journalEntry.findMany({ where: { fiscalYearId: yearId }, select: { id: true } });
      const entryIds = entries.map((e) => e.id);
      const grouped = entryIds.length
        ? await tx.journalLine.groupBy({ by: ['accountId'], where: { entryId: { in: entryIds } }, _sum: { debit: true, credit: true } })
        : [];
      const accounts = await tx.account.findMany({ select: { id: true, code: true } });
      const codeById = new Map(accounts.map((a) => [a.id, a.code]));

      const lines: { accountCode: string; debit?: number; credit?: number }[] = [];
      let result = 0; // produits − charges
      let bsDebit = 0;
      let bsCredit = 0;
      for (const g of grouped) {
        const code = codeById.get(g.accountId);
        if (!code) continue;
        const debit = Number(g._sum.debit ?? 0);
        const credit = Number(g._sum.credit ?? 0);
        const solde = Math.round((debit - credit) * 100) / 100;
        const cls = accountClass(code);
        if (cls === 6) result -= debit - credit;
        else if (cls === 7) result += credit - debit;
        else if (solde !== 0) {
          // Compte de bilan → reporté.
          if (solde > 0) { lines.push({ accountCode: code, debit: solde }); bsDebit += solde; }
          else { lines.push({ accountCode: code, credit: -solde }); bsCredit += -solde; }
        }
      }
      result = Math.round(result * 100) / 100;

      // Ligne d'équilibre = résultat → 1191.
      const imbalance = Math.round((bsDebit - bsCredit) * 100) / 100;
      if (Math.abs(imbalance) > 0.01) {
        if (imbalance > 0) lines.push({ accountCode: RESULT_ACCOUNT, credit: imbalance });
        else lines.push({ accountCode: RESULT_ACCOUNT, debit: -imbalance });
      }

      if (lines.length >= 2) {
        // À-nouveaux dans l'exercice suivant (idempotent par exercice clôturé).
        const r = await postEntry(tx, tenantId, {
          journal: 'OD',
          date: next.startDate,
          label: `À-nouveaux (report ${year.label})`,
          sourceType: 'YearOpening',
          sourceId: yearId,
          postedByUserId: s.user.id,
          lines,
        });
        if (!r) return { ok: false, error: 'Report impossible (exercice suivant introuvable).' };
      }

      await tx.fiscalYear.update({ where: { id: yearId }, data: { status: 'CLOSED' } });
      await logAudit(tx, { tenantId, userId: s.user.id, action: 'close_fiscal_year', entityType: 'FiscalYear', entityId: yearId, after: { result } });
      revalidatePath('/admin/comptabilite/cloture');
      return { ok: true, message: `Exercice clôturé. Résultat : ${result.toFixed(2)} reporté en à-nouveaux.` };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/** Réouvre un exercice clôturé et supprime l'à-nouveau généré. */
export async function reopenFiscalYearAction(yearId: string): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const tenantId = s.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      await tx.journalEntry.deleteMany({ where: { tenantId, sourceType: 'YearOpening', sourceId: yearId } });
      await tx.fiscalYear.update({ where: { id: yearId }, data: { status: 'OPEN' } });
      await logAudit(tx, { tenantId, userId: s.user.id, action: 'reopen_fiscal_year', entityType: 'FiscalYear', entityId: yearId });
    });
    revalidatePath('/admin/comptabilite/cloture');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
