/**
 * Service de comptabilisation central : toutes les écritures passent ici.
 * Garantit l'équilibre (Σ débit = Σ crédit) et l'idempotence par pièce source.
 */
import type { Prisma } from '@jawal/db';

export type PostLine = { accountCode: string; debit?: number; credit?: number; label?: string };

export type PostEntryInput = {
  journal: 'VE' | 'AC' | 'BQ' | 'CA' | 'PA' | 'OD';
  date: Date;
  label: string;
  reference?: string | null;
  /** Idempotence : une pièce métier ne crée qu'une écriture. */
  sourceType?: string | null;
  sourceId?: string | null;
  lines: PostLine[];
  postedByUserId?: string | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Poste une écriture équilibrée dans l'exercice en cours. Idempotent : si une
 * écriture existe déjà pour (sourceType, sourceId), elle est renvoyée sans doublon.
 * Retourne null si aucun exercice ouvert ne couvre la date.
 */
export async function postEntry(
  tx: Prisma.TransactionClient,
  tenantId: string,
  input: PostEntryInput,
): Promise<{ entryId: string; created: boolean } | null> {
  // Idempotence.
  if (input.sourceType && input.sourceId) {
    const existing = await tx.journalEntry.findFirst({
      where: { tenantId, sourceType: input.sourceType, sourceId: input.sourceId },
      select: { id: true },
    });
    if (existing) return { entryId: existing.id, created: false };
  }

  // Exercice couvrant la date (sinon le plus récent ouvert).
  const fy =
    (await tx.fiscalYear.findFirst({ where: { tenantId, status: 'OPEN', startDate: { lte: input.date }, endDate: { gte: input.date } } })) ??
    (await tx.fiscalYear.findFirst({ where: { tenantId, status: 'OPEN' }, orderBy: { startDate: 'desc' } }));
  if (!fy) return null;

  // Validation équilibre.
  const totDebit = r2(input.lines.reduce((s, l) => s + (l.debit ?? 0), 0));
  const totCredit = r2(input.lines.reduce((s, l) => s + (l.credit ?? 0), 0));
  if (totDebit <= 0 || Math.abs(totDebit - totCredit) > 0.01) {
    throw new Error(`Écriture déséquilibrée (D=${totDebit} ≠ C=${totCredit}).`);
  }

  // Résolution des comptes.
  const codes = [...new Set(input.lines.map((l) => l.accountCode))];
  const accounts = await tx.account.findMany({ where: { tenantId, code: { in: codes } }, select: { id: true, code: true } });
  const byCode = new Map(accounts.map((a) => [a.code, a.id]));
  const missing = codes.filter((c) => !byCode.has(c));
  if (missing.length) throw new Error(`Comptes absents du plan : ${missing.join(', ')}.`);

  const entry = await tx.journalEntry.create({
    data: {
      tenantId,
      fiscalYearId: fy.id,
      journal: input.journal,
      date: input.date,
      label: input.label,
      reference: input.reference ?? null,
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      postedByUserId: input.postedByUserId ?? null,
      lines: {
        create: input.lines.map((l) => ({
          tenantId,
          accountId: byCode.get(l.accountCode)!,
          debit: r2(l.debit ?? 0),
          credit: r2(l.credit ?? 0),
          label: l.label ?? null,
        })),
      },
    },
    select: { id: true },
  });
  return { entryId: entry.id, created: true };
}
