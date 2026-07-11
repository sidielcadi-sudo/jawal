/**
 * Hooks de comptabilisation automatique : les modules métier appellent ces
 * fonctions pour poster dans le grand livre. **Best-effort** : toute erreur
 * (pas d'exercice, plan absent…) est avalée — la compta ne doit JAMAIS bloquer
 * l'opération métier. L'idempotence est gérée par `postEntry` (sourceType+id).
 */
import type { Prisma } from '@jawal/db';
import { postEntry } from './accounting';

// Comptes par défaut (le plan CGNC peut être ajusté ; ces codes doivent exister).
const CLIENTS = '3421';
const PRODUIT_SCOLARITE = '7111';

/** Ventilation client/produit par nature (déduite du libellé de l'échéance). */
function categoryAccounts(label: string): { client: string; product: string } {
  if (/transport/i.test(label)) return { client: '34212', product: '7112' };
  if (/cantine|canteen/i.test(label)) return { client: '34213', product: '7113' };
  return { client: '34211', product: '7111' }; // scolarité / inscription par défaut
}
const BANQUE = '5141';
const CAISSE = '5161';
const DETTES_VENDEURS = '4468';
const COMMISSION = '7588';
const FOURNISSEURS = '4411';

const treasury = (method: string | null | undefined) => (method === 'CASH' ? CAISSE : BANQUE);
const treasuryJournal = (method: string | null | undefined): 'BQ' | 'CA' => (method === 'CASH' ? 'CA' : 'BQ');

async function safe(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch {
    // best-effort : on n'interrompt pas l'opération métier.
  }
}

/** Facturation d'une échéance (produit + créance client). Idempotent par échéance. */
export async function postInstallmentInvoice(
  tx: Prisma.TransactionClient,
  tenantId: string,
  inst: { id: string; amount: number; dueDate: Date; label: string },
  accounts: { client: string; product: string },
  userId?: string,
) {
  await safe(() =>
    postEntry(tx, tenantId, {
      journal: 'VE',
      date: inst.dueDate,
      label: `Facturation — ${inst.label}`,
      sourceType: 'InstallmentInvoice',
      sourceId: inst.id,
      postedByUserId: userId,
      lines: [
        { accountCode: accounts.client, debit: inst.amount },
        { accountCode: accounts.product, credit: inst.amount },
      ],
    }),
  );
}

/** Encaissement d'un paiement (trésorerie / créance client). */
export async function postPaymentReceipt(
  tx: Prisma.TransactionClient,
  tenantId: string,
  payment: { id: string; amount: number; method: string | null },
  date: Date,
  label: string,
  clientAccount: string,
  userId?: string,
) {
  await safe(() =>
    postEntry(tx, tenantId, {
      journal: treasuryJournal(payment.method),
      date,
      label: `Encaissement — ${label}`,
      sourceType: 'Payment',
      sourceId: payment.id,
      postedByUserId: userId,
      lines: [
        { accountCode: treasury(payment.method), debit: payment.amount },
        { accountCode: clientAccount, credit: payment.amount },
      ],
    }),
  );
}

/** Facture (idempotent) + encaisse un paiement sur une échéance — un seul appel. */
export async function postInstallmentPayment(
  tx: Prisma.TransactionClient,
  tenantId: string,
  installmentId: string,
  payment: { id: string; amount: number; method: string | null },
  date: Date,
  userId?: string,
) {
  await safe(async () => {
    const inst = await tx.installment.findUnique({ where: { id: installmentId }, select: { id: true, amount: true, dueDate: true, label: true } });
    if (!inst) return;
    const acc = categoryAccounts(inst.label);
    await postInstallmentInvoice(tx, tenantId, { id: inst.id, amount: Number(inst.amount), dueDate: inst.dueDate, label: inst.label }, acc, userId);
    await postPaymentReceipt(tx, tenantId, payment, date, inst.label, acc.client, userId);
  });
}

/**
 * Remboursement d'un élève radié en cours d'année : sortie de trésorerie qui
 * solde l'avoir de la famille (créance client 34211). Idempotent par refund.
 */
export async function postStudentRefund(
  tx: Prisma.TransactionClient,
  tenantId: string,
  refundId: string,
  amount: number,
  method: 'VIREMENT' | 'CHEQUE' | 'ESPECES',
  date: Date,
  userId?: string,
) {
  if (amount <= 0) return;
  const m = method === 'ESPECES' ? 'CASH' : 'BANK';
  await safe(() =>
    postEntry(tx, tenantId, {
      journal: treasuryJournal(m),
      date,
      label: 'Remboursement élève (radiation)',
      sourceType: 'StudentRefund',
      sourceId: refundId,
      postedByUserId: userId,
      lines: [
        { accountCode: '34211', debit: amount }, // solde l'avoir de la famille
        { accountCode: treasury(m), credit: amount }, // sortie caisse / banque
      ],
    }),
  );
}

// Comptes CGNC d'annulation de créance :
// - REMISE (gracieuse) → 7119 « RRR accordés par l'entreprise » (réduction de produit, classe 7).
// - IRRECOUVRABLE (non-recouvrement, radiation) → 6585 « Créances devenues irrécouvrables » (charge non courante, classe 6).
const REMISE_ACCORDEE = '7119';
const CREANCE_IRRECOUVRABLE = '6585';

/**
 * Annulation d'une créance. Selon `kind` :
 *  - 'REMISE' (défaut) : Débit 7119 (remise accordée) / Crédit 34211.
 *  - 'IRRECOUVRABLE'   : Débit 6585 (créance irrécouvrable) / Crédit 34211.
 * La créance disparaît du compte client mais l'opération reste au journal OD.
 * Idempotent par échéance. Best-effort.
 */
export async function postDebtWaiver(
  tx: Prisma.TransactionClient,
  tenantId: string,
  installment: { id: string; label: string },
  amount: number,
  date: Date,
  userId?: string,
  kind: 'REMISE' | 'IRRECOUVRABLE' = 'REMISE',
) {
  if (amount <= 0) return;
  const acc = categoryAccounts(installment.label);
  const irrecoverable = kind === 'IRRECOUVRABLE';
  const debitAccount = irrecoverable ? CREANCE_IRRECOUVRABLE : REMISE_ACCORDEE;
  const label = irrecoverable
    ? `Créance irrécouvrable (radiation) — ${installment.label}`
    : `Remise gracieuse / créance annulée — ${installment.label}`;
  await safe(() =>
    postEntry(tx, tenantId, {
      journal: 'OD',
      date,
      label,
      sourceType: 'DebtWaiver',
      sourceId: installment.id,
      postedByUserId: userId,
      lines: [
        { accountCode: debitAccount, debit: amount }, // 7119 (remise) ou 6585 (irrécouvrable)
        { accountCode: acc.client, credit: amount }, // solde la créance client
      ],
    }),
  );
}

/** Écriture de paie à la clôture d'un run (depuis les lignes du journal de paie). */
export async function postPayrollRun(
  tx: Prisma.TransactionClient,
  tenantId: string,
  runId: string,
  lines: { account: string; debit: number; credit: number }[],
  date: Date,
  label: string,
  userId?: string,
) {
  await safe(() =>
    postEntry(tx, tenantId, {
      journal: 'PA',
      date,
      label,
      sourceType: 'PayrollRun',
      sourceId: runId,
      postedByUserId: userId,
      lines: lines.filter((l) => l.debit > 0 || l.credit > 0).map((l) => ({ accountCode: l.account, debit: l.debit, credit: l.credit })),
    }),
  );
}

/** Dépense directe (payée comptant) : charge 6x / trésorerie. */
const EXPENSE_ACCOUNTS: Record<string, string> = {
  SALARY: '6171', RENT: '6131', UTILITIES: '6125', SUPPLIES: '6125',
  MAINTENANCE: '6133', TRANSPORT: '6145', TAXES: '6167', OTHER: '6141',
};
export async function postExpense(
  tx: Prisma.TransactionClient,
  tenantId: string,
  expense: { id: string; amount: number; category: string; method: string | null; date: Date; label: string },
  userId?: string,
) {
  const charge = EXPENSE_ACCOUNTS[expense.category] ?? '6141';
  await safe(() =>
    postEntry(tx, tenantId, {
      journal: treasuryJournal(expense.method),
      date: expense.date,
      label: `Dépense — ${expense.label}`,
      sourceType: 'Expense',
      sourceId: expense.id,
      postedByUserId: userId,
      lines: [
        { accountCode: charge, debit: expense.amount },
        { accountCode: treasury(expense.method), credit: expense.amount },
      ],
    }),
  );
}

/** Facture fournisseur (engagement) : charge 6x / dette fournisseur 4411. */
export async function postSupplierInvoice(
  tx: Prisma.TransactionClient,
  tenantId: string,
  invoice: { id: string; accountCode: string; amount: number; date: Date; label: string },
  userId?: string,
) {
  await safe(() =>
    postEntry(tx, tenantId, {
      journal: 'AC',
      date: invoice.date,
      label: `Facture fournisseur — ${invoice.label}`,
      sourceType: 'SupplierInvoice',
      sourceId: invoice.id,
      postedByUserId: userId,
      lines: [
        { accountCode: invoice.accountCode, debit: invoice.amount },
        { accountCode: FOURNISSEURS, credit: invoice.amount },
      ],
    }),
  );
}

/** Paiement fournisseur : dette fournisseur 4411 / trésorerie. */
export async function postSupplierPayment(
  tx: Prisma.TransactionClient,
  tenantId: string,
  payment: { id: string; amount: number; method: string | null; date: Date },
  label: string,
  userId?: string,
) {
  await safe(() =>
    postEntry(tx, tenantId, {
      journal: treasuryJournal(payment.method),
      date: payment.date,
      label: `Règlement fournisseur — ${label}`,
      sourceType: 'SupplierPayment',
      sourceId: payment.id,
      postedByUserId: userId,
      lines: [
        { accountCode: FOURNISSEURS, debit: payment.amount },
        { accountCode: treasury(payment.method), credit: payment.amount },
      ],
    }),
  );
}

/** Vente bourse : trésorerie / (dette vendeur + commission). */
export async function postBookSale(
  tx: Prisma.TransactionClient,
  tenantId: string,
  txnId: string,
  salePrice: number,
  commission: number,
  method: string | null,
  date: Date,
  userId?: string,
) {
  const net = Math.round((salePrice - commission) * 100) / 100;
  const lines = [{ accountCode: treasury(method), debit: salePrice }, { accountCode: DETTES_VENDEURS, credit: net }];
  if (commission > 0) lines.push({ accountCode: COMMISSION, credit: commission });
  await safe(() =>
    postEntry(tx, tenantId, { journal: treasuryJournal(method), date, label: 'Vente bourse aux livres', sourceType: 'BookSale', sourceId: txnId, postedByUserId: userId, lines }),
  );
}

/** Remboursement bourse : dette vendeur / (caisse OU créance élève si avoir). */
export async function postBookRefund(
  tx: Prisma.TransactionClient,
  tenantId: string,
  txnId: string,
  amount: number,
  mode: 'CASH' | 'CREDIT',
  date: Date,
  userId?: string,
) {
  const credit = mode === 'CASH' ? CAISSE : CLIENTS; // avoir → réduit la créance de l'élève
  await safe(() =>
    postEntry(tx, tenantId, {
      journal: mode === 'CASH' ? 'CA' : 'OD',
      date,
      label: 'Remboursement bourse aux livres',
      sourceType: 'BookRefund',
      sourceId: txnId,
      postedByUserId: userId,
      lines: [{ accountCode: DETTES_VENDEURS, debit: amount }, { accountCode: credit, credit: amount }],
    }),
  );
}
