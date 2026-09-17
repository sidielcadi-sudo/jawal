/**
 * Vue groupe › Finance — agrégats consolidés, sans base.
 *
 * Chaque établissement fournit, pour son année active et l'année précédente,
 * une grille mois × catégorie de frais. Les filtres de l'écran (année,
 * trimestre) ne font que choisir des mois de cette grille : tout se recalcule
 * côté client sans nouvel aller-retour.
 */

export const FIN_CATS = [
  'TUITION',
  'INSCRIPTION',
  'CANTEEN',
  'TRANSPORT',
  'DAYCARE',
  'SUPPORT',
  'EXCEPTIONAL',
  'OTHER',
] as const;
export type FinCat = (typeof FIN_CATS)[number];

/** Mois couverts par une année scolaire (échéances d'été comprises). */
export const FIN_MONTHS = 12;

export type FinCell = {
  billed: number;
  /** Encaissé sur ces échéances, à date. */
  collected: number;
  /** Montant des échéances déjà tombées, et ce qui en a été encaissé. */
  dueBilled: number;
  dueCollected: number;
  /** Reste échu, dont plus de 60 jours de retard. */
  overdue: number;
  over60: number;
  /** Reste des échéances à venir. */
  upcoming: number;
  /** Foyers ayant un reste échu. */
  families: string[];
};

export type YearFin = { label: string; months: Array<Partial<Record<FinCat, FinCell>>> };

export type FinInstallment = {
  amount: number;
  dueDate: Date;
  category: FinCat;
  family: string;
  payments: Array<{ amount: number; paidAt: Date }>;
};

const DAY = 86_400_000;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Rang du mois de `d` dans l'année commencée en `start`, borné à la grille. */
export function monthIndex(d: Date, start: Date, count = FIN_MONTHS): number {
  const k = (d.getUTCFullYear() - start.getUTCFullYear()) * 12 + d.getUTCMonth() - start.getUTCMonth();
  return Math.min(count - 1, Math.max(0, k));
}

export function buildYearFin(
  label: string,
  items: FinInstallment[],
  yearStart: Date,
  today: Date,
): YearFin {
  const months: YearFin['months'] = Array.from({ length: FIN_MONTHS }, () => ({}));
  for (const it of items) {
    const k = monthIndex(it.dueDate, yearStart);
    const cell = (months[k]![it.category] ??= {
      billed: 0,
      collected: 0,
      dueBilled: 0,
      dueCollected: 0,
      overdue: 0,
      over60: 0,
      upcoming: 0,
      families: [],
    });
    const paid = it.payments.filter((p) => p.paidAt <= today).reduce((s, p) => s + p.amount, 0);
    const rest = Math.max(0, it.amount - paid);
    cell.billed = round2(cell.billed + it.amount);
    cell.collected = round2(cell.collected + paid);
    if (it.dueDate <= today) {
      cell.dueBilled = round2(cell.dueBilled + it.amount);
      cell.dueCollected = round2(cell.dueCollected + paid);
      if (rest > 0.01) {
        cell.overdue = round2(cell.overdue + rest);
        if (today.getTime() - it.dueDate.getTime() > 60 * DAY) cell.over60 = round2(cell.over60 + rest);
        if (!cell.families.includes(it.family)) cell.families.push(it.family);
      }
    } else if (rest > 0.01) {
      cell.upcoming = round2(cell.upcoming + rest);
    }
  }
  return { label, months };
}

export type FinTotals = {
  billed: number;
  collected: number;
  dueBilled: number;
  dueCollected: number;
  overdue: number;
  over60: number;
  upcoming: number;
  families: number;
  byCat: Record<FinCat, { billed: number; collected: number; overdue: number; families: number }>;
};

const emptyCats = () =>
  Object.fromEntries(FIN_CATS.map((c) => [c, { billed: 0, collected: 0, overdue: 0, families: 0 }])) as FinTotals['byCat'];

export function emptyTotals(): FinTotals {
  return { billed: 0, collected: 0, dueBilled: 0, dueCollected: 0, overdue: 0, over60: 0, upcoming: 0, families: 0, byCat: emptyCats() };
}

/** Totaux d'un établissement sur les mois choisis (`null` = toute l'année). */
export function siteTotals(year: YearFin | null, months: number[] | null): FinTotals {
  const out = emptyTotals();
  if (!year) return out;
  const families = new Set<string>();
  const catFamilies = new Map<FinCat, Set<string>>();
  year.months.forEach((m, k) => {
    if (months && !months.includes(k)) return;
    for (const cat of FIN_CATS) {
      const c = m[cat];
      if (!c) continue;
      out.billed += c.billed;
      out.collected += c.collected;
      out.dueBilled += c.dueBilled;
      out.dueCollected += c.dueCollected;
      out.overdue += c.overdue;
      out.over60 += c.over60;
      out.upcoming += c.upcoming;
      out.byCat[cat].billed += c.billed;
      out.byCat[cat].collected += c.collected;
      out.byCat[cat].overdue += c.overdue;
      const set = catFamilies.get(cat) ?? new Set<string>();
      for (const f of c.families) {
        families.add(f);
        set.add(f);
      }
      catFamilies.set(cat, set);
    }
  });
  out.families = families.size;
  for (const [cat, set] of catFamilies) out.byCat[cat].families = set.size;
  return roundTotals(out);
}

/** Consolidé : les foyers de deux établissements sont distincts, ils s'additionnent. */
export function mergeTotals(list: FinTotals[]): FinTotals {
  const out = emptyTotals();
  for (const t of list) {
    out.billed += t.billed;
    out.collected += t.collected;
    out.dueBilled += t.dueBilled;
    out.dueCollected += t.dueCollected;
    out.overdue += t.overdue;
    out.over60 += t.over60;
    out.upcoming += t.upcoming;
    out.families += t.families;
    for (const cat of FIN_CATS) {
      out.byCat[cat].billed += t.byCat[cat].billed;
      out.byCat[cat].collected += t.byCat[cat].collected;
      out.byCat[cat].overdue += t.byCat[cat].overdue;
      out.byCat[cat].families += t.byCat[cat].families;
    }
  }
  return roundTotals(out);
}

function roundTotals(t: FinTotals): FinTotals {
  for (const k of ['billed', 'collected', 'dueBilled', 'dueCollected', 'overdue', 'over60', 'upcoming'] as const) {
    t[k] = round2(t[k]);
  }
  for (const cat of FIN_CATS) {
    t.byCat[cat].billed = round2(t.byCat[cat].billed);
    t.byCat[cat].collected = round2(t.byCat[cat].collected);
    t.byCat[cat].overdue = round2(t.byCat[cat].overdue);
  }
  return t;
}

const ratio = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

/** Encaissé / facturé. */
export const collectionRate = (t: FinTotals) => ratio(t.collected, t.billed);

/** Encaissé sur les échéances tombées / montant de ces échéances. */
export const recoveryRate = (t: FinTotals) => ratio(t.dueCollected, t.dueBilled);

export type Health = 'good' | 'watch' | 'risk' | 'none';

/** Santé financière d'un établissement, lue sur son taux de recouvrement à date. */
export function siteHealth(rate: number | null): Health {
  if (rate === null) return 'none';
  if (rate >= 90) return 'good';
  if (rate >= 75) return 'watch';
  return 'risk';
}

/** Variation en %, arrondie au dixième. */
export function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/**
 * Prévisionnel : reste à encaisser des échéances des `count` mois civils
 * suivant le mois en cours.
 */
export function forecast(
  items: FinInstallment[],
  today: Date,
  count = 3,
): Array<{ month: string; amount: number }> {
  const out = Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1 + i, 1));
    return { month: d.toISOString().slice(0, 7), amount: 0 };
  });
  for (const it of items) {
    const slot = out.find((o) => o.month === it.dueDate.toISOString().slice(0, 7));
    if (!slot) continue;
    const paid = it.payments.reduce((s, p) => s + p.amount, 0);
    slot.amount = round2(slot.amount + Math.max(0, it.amount - paid));
  }
  return out;
}
