/**
 * Journal de paie (écritures comptables agrégées d'un run) selon le mapping de
 * comptes CGNC paramétré. Équilibré : Débit (brut + charges patronales) =
 * Crédit (net + organismes sociaux + État-IR [+ avances]).
 */
export type JournalLine = { account: string; label: string; debit: number; credit: number };

export type PayrollAggregates = {
  brut: number;
  employerCharges: number;
  net: number;
  socialBothShares: number; // CNSS+AMO+CIMR salarié + patronal
  ir: number;
  internal: number;
};

export type AccountMapping = {
  salaries: string; socialCharges: string; netPayable: string;
  cnss: string; amo: string; ir: string; bank: string;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function buildJournal(agg: PayrollAggregates, m: AccountMapping): JournalLine[] {
  const lines: JournalLine[] = [
    { account: m.salaries, label: 'Rémunérations du personnel', debit: r2(agg.brut), credit: 0 },
    { account: m.socialCharges, label: 'Charges sociales patronales', debit: r2(agg.employerCharges), credit: 0 },
    { account: m.netPayable, label: 'Rémunérations dues au personnel (net)', debit: 0, credit: r2(agg.net) },
    { account: m.cnss, label: 'Organismes sociaux (CNSS / AMO / CIMR)', debit: 0, credit: r2(agg.socialBothShares) },
    { account: m.ir, label: 'État — IR', debit: 0, credit: r2(agg.ir) },
  ];
  if (agg.internal > 0) lines.push({ account: '3431', label: 'Avances / retenues sur salaire', debit: 0, credit: r2(agg.internal) });
  return lines;
}

export function journalTotals(lines: JournalLine[]): { debit: number; credit: number; balanced: boolean } {
  const debit = r2(lines.reduce((s, l) => s + l.debit, 0));
  const credit = r2(lines.reduce((s, l) => s + l.credit, 0));
  return { debit, credit, balanced: Math.abs(debit - credit) < 0.05 };
}
