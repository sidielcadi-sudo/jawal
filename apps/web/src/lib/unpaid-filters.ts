/**
 * Gestion des impayés — filtres, indicateurs et regroupement, sans base.
 *
 * Le chargeur (`loadUnpaidLedger`) remonte toutes les échéances non annulées,
 * payées comprises : les indicateurs en ont besoin (total facturé, encaissé),
 * le tableau n'en garde que les restes à payer.
 */
import type { UnpaidFamilyGroup, UnpaidInstallment, UnpaidStudentGroup, UnpaidYearRow } from './unpaid';

export type LedgerRow = {
  id: string;
  studentId: string;
  studentName: string;
  familyId: string;
  familyName: string;
  /** Tous les responsables rattachés — la recherche « tuteur » porte sur eux. */
  guardians: string[];
  yearId: string | null;
  yearLabel: string;
  /** Exercice antérieur à l'année active. */
  previous: boolean;
  cycleId: string | null;
  classId: string | null;
  label: string;
  dueDate: Date;
  amount: number;
  /** Total versé sur l'échéance. */
  paid: number;
  payments: Array<{ amount: number; paidAt: Date }>;
  contentious: boolean;
};

export type UnpaidStatus = '' | 'ECHU' | 'NON_ECHU' | 'CONTENTIEUX';
export type RowStatus = 'PAID' | 'CONTENTIEUX' | 'ECHU' | 'NON_ECHU';

const round2 = (n: number) => Math.round(n * 100) / 100;
const strip = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
export const isoMonth = (d: Date) => d.toISOString().slice(0, 7);

export const remainingOf = (r: LedgerRow) => round2(Math.max(0, r.amount - r.paid));

/**
 * Statut d'une échéance : soldée, en contentieux, échue (date passée) ou non
 * échue. Le contentieux prime sur la date : c'est un traitement à part, il ne
 * se relance plus comme un simple retard.
 */
export function rowStatus(r: LedgerRow, today: Date): RowStatus {
  if (remainingOf(r) <= 0.01) return 'PAID';
  if (r.contentious) return 'CONTENTIEUX';
  return r.dueDate <= today ? 'ECHU' : 'NON_ECHU';
}

export type LedgerFilters = {
  yearId?: string | null;
  status?: UnpaidStatus;
  cycleId?: string | null;
  classId?: string | null;
  /** AAAA-MM */
  month?: string | null;
  q?: string;
};

/** Périmètre des indicateurs : année, cycle, classe. */
export function filterScope(rows: LedgerRow[], f: LedgerFilters): LedgerRow[] {
  return rows.filter(
    (r) =>
      (!f.yearId || r.yearId === f.yearId) &&
      (!f.cycleId || r.cycleId === f.cycleId) &&
      (!f.classId || r.classId === f.classId),
  );
}

/** Lignes du tableau : restes à payer du périmètre, filtrés par statut, mois et recherche. */
export function filterRows(rows: LedgerRow[], f: LedgerFilters, today: Date): LedgerRow[] {
  const q = strip((f.q ?? '').trim());
  return filterScope(rows, f).filter((r) => {
    const st = rowStatus(r, today);
    if (st === 'PAID') return false;
    if (f.status && st !== f.status) return false;
    if (f.month && isoMonth(r.dueDate) !== f.month) return false;
    if (q && !strip(`${r.studentName} ${r.familyName} ${r.guardians.join(' ')}`).includes(q)) return false;
    return true;
  });
}

export type UnpaidKpis = {
  billed: number;
  collected: number;
  /** Encaissé / facturé (en %). */
  collectedPct: number | null;
  /** Reste des échéances échues (contentieux compris). */
  overdue: number;
  overdueFamilies: number;
  /** Reste des échéances à venir. */
  upcoming: number;
  /** Mois (AAAA-MM) des échéances à venir non soldées. */
  upcomingMonths: string[];
  /** Encaissé sur les échéances tombées / montant de ces échéances (en %). */
  recoveryRate: number | null;
};

/**
 * Indicateurs d'un périmètre, arrêtés à `asOf`.
 *
 * Le taux de recouvrement ne rapporte l'encaissé qu'aux échéances déjà tombées
 * — même définition que « Taux de recouvrement à date » de la page Finances :
 * une échéance de juin non payée en octobre n'est pas un retard. `asOf` permet
 * de le recalculer « à la même date l'an dernier », paiements postérieurs exclus.
 */
export function unpaidKpis(rows: LedgerRow[], asOf: Date): UnpaidKpis {
  let billed = 0;
  let collected = 0;
  let overdue = 0;
  let upcoming = 0;
  let dueToDate = 0;
  let paidToDate = 0;
  const families = new Set<string>();
  const months = new Set<string>();
  for (const r of rows) {
    const paid = r.payments.filter((p) => p.paidAt <= asOf).reduce((s, p) => s + p.amount, 0);
    const rest = Math.max(0, r.amount - paid);
    billed += r.amount;
    collected += paid;
    if (r.dueDate <= asOf) {
      dueToDate += r.amount;
      paidToDate += paid;
      if (rest > 0.01) {
        overdue += rest;
        families.add(r.familyId);
      }
    } else if (rest > 0.01) {
      upcoming += rest;
      months.add(isoMonth(r.dueDate));
    }
  }
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
  return {
    billed: round2(billed),
    collected: round2(collected),
    collectedPct: pct(collected, billed),
    overdue: round2(overdue),
    overdueFamilies: families.size,
    upcoming: round2(upcoming),
    upcomingMonths: [...months].sort(),
    recoveryRate: pct(paidToDate, dueToDate),
  };
}

/** Écart de taux, en points. */
export function recoveryDelta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return Math.round((current - previous) * 10) / 10;
}

export type LedgerYearRow = UnpaidYearRow & { contentious: boolean; overdueIds: string[] };

/**
 * Regroupe les restes à payer en famille → élève → année, la forme du tableau.
 * `yearOrder` : rang chronologique des années (les plus anciennes en tête).
 */
export function groupFamilies(
  rows: LedgerRow[],
  today: Date,
  yearOrder: ReadonlyMap<string, number>,
): UnpaidFamilyGroup[] {
  const dayMs = 86_400_000;
  type Cell = {
    first: LedgerRow;
    due: number;
    paid: number;
    unpaid: number;
    echeances: string[];
    firstOverdue: Date | null;
    items: UnpaidInstallment[];
    contentious: boolean;
    overdueIds: string[];
  };
  const cells = new Map<string, Cell>();
  for (const r of rows) {
    const rest = remainingOf(r);
    if (rest <= 0.01) continue;
    const key = `${r.studentId}|${r.yearId ?? 'none'}`;
    const c =
      cells.get(key) ??
      ({ first: r, due: 0, paid: 0, unpaid: 0, echeances: [], firstOverdue: null, items: [], contentious: false, overdueIds: [] } as Cell);
    c.due += r.amount;
    c.paid += r.paid;
    c.unpaid += rest;
    c.echeances.push(r.label);
    if (r.dueDate <= today) {
      if (!c.firstOverdue || r.dueDate < c.firstOverdue) c.firstOverdue = r.dueDate;
      c.overdueIds.push(r.id);
    }
    if (r.contentious) c.contentious = true;
    c.items.push({
      id: r.id,
      label: r.label,
      dueDate: r.dueDate.toISOString(),
      amount: round2(r.amount),
      paid: round2(r.paid),
      remaining: rest,
    });
    cells.set(key, c);
  }

  const students = new Map<string, UnpaidStudentGroup & { familyId: string; familyName: string }>();
  for (const c of cells.values()) {
    const r = c.first;
    const daysLate = c.firstOverdue ? Math.max(0, Math.floor((today.getTime() - c.firstOverdue.getTime()) / dayMs)) : 0;
    const year: LedgerYearRow = {
      yearId: r.yearId,
      yearLabel: r.yearLabel,
      due: round2(c.due),
      paid: round2(c.paid),
      unpaid: round2(c.unpaid),
      echeances: c.echeances,
      daysLate,
      previous: r.previous,
      items: c.items,
      contentious: c.contentious,
      overdueIds: c.overdueIds,
    };
    const s =
      students.get(r.studentId) ??
      { studentId: r.studentId, studentName: r.studentName, years: [], unpaid: 0, previousUnpaid: 0, daysLate: 0, familyId: r.familyId, familyName: r.familyName };
    s.years.push(year);
    s.unpaid = round2(s.unpaid + year.unpaid);
    if (year.previous) s.previousUnpaid = round2(s.previousUnpaid + year.unpaid);
    s.daysLate = Math.max(s.daysLate, daysLate);
    students.set(r.studentId, s);
  }

  const families = new Map<string, UnpaidFamilyGroup>();
  for (const s of students.values()) {
    s.years.sort((a, b) => (yearOrder.get(a.yearId ?? '') ?? -1) - (yearOrder.get(b.yearId ?? '') ?? -1));
    const f =
      families.get(s.familyId) ??
      { familyId: s.familyId, familyName: s.familyName, students: [], unpaid: 0, previousUnpaid: 0, daysLate: 0, rowCount: 0 };
    const { familyId: _f, familyName: _n, ...student } = s;
    f.students.push(student);
    f.unpaid = round2(f.unpaid + s.unpaid);
    f.previousUnpaid = round2(f.previousUnpaid + s.previousUnpaid);
    f.daysLate = Math.max(f.daysLate, s.daysLate);
    f.rowCount += s.years.length;
    families.set(s.familyId, f);
  }
  const out = [...families.values()].sort((a, b) => a.familyName.localeCompare(b.familyName) || b.unpaid - a.unpaid);
  for (const f of out) f.students.sort((a, b) => b.unpaid - a.unpaid || a.studentName.localeCompare(b.studentName));
  return out;
}
