import { describe, it, expect } from 'vitest';
import {
  buildYearFin,
  collectionRate,
  forecast,
  mergeTotals,
  monthIndex,
  pctChange,
  recoveryRate,
  siteHealth,
  siteTotals,
  type FinInstallment,
} from './group-finance';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const start = d('2026-09-01');
const today = d('2026-12-15');

const inst = (o: Partial<FinInstallment>): FinInstallment => ({
  amount: 1000,
  dueDate: d('2026-09-05'),
  category: 'TUITION',
  family: 'f1',
  payments: [],
  ...o,
});

describe('grille mensuelle', () => {
  it('range par mois de l’année scolaire, bornes comprises', () => {
    expect(monthIndex(d('2026-09-30'), start)).toBe(0);
    expect(monthIndex(d('2027-01-05'), start)).toBe(4);
    expect(monthIndex(d('2026-08-20'), start)).toBe(0);
    expect(monthIndex(d('2027-12-01'), start)).toBe(11);
  });

  it('distingue échu, retard > 60 j et à venir', () => {
    const y = buildYearFin(
      '2026-2027',
      [
        inst({ payments: [{ amount: 400, paidAt: d('2026-09-10') }] }), // échu depuis > 60 j
        inst({ dueDate: d('2026-12-05'), category: 'CANTEEN', family: 'f2' }), // échu récent
        inst({ dueDate: d('2027-01-05'), payments: [{ amount: 1000, paidAt: d('2026-12-01') }] }), // payé d'avance
        inst({ dueDate: d('2027-02-05') }), // à venir
      ],
      start,
      today,
    );
    const t = siteTotals(y, null);
    expect(t).toMatchObject({
      billed: 4000,
      collected: 1400,
      dueBilled: 2000,
      dueCollected: 400,
      overdue: 1600,
      over60: 600,
      upcoming: 1000,
      families: 2,
    });
    expect(t.byCat.CANTEEN).toEqual({ billed: 1000, collected: 0, overdue: 1000, families: 1 });
    expect(collectionRate(t)).toBe(35);
    expect(recoveryRate(t)).toBe(20);
  });

  it('ne garde que les mois demandés (trimestre)', () => {
    const y = buildYearFin('x', [inst({}), inst({ dueDate: d('2027-01-05') })], start, today);
    expect(siteTotals(y, [0, 1, 2, 3]).billed).toBe(1000);
    expect(siteTotals(y, [4, 5, 6]).billed).toBe(1000);
    expect(siteTotals(null, null).billed).toBe(0);
  });
});

describe('consolidation et lecture', () => {
  it('additionne les établissements', () => {
    const a = siteTotals(buildYearFin('x', [inst({})], start, today), null);
    const b = siteTotals(buildYearFin('x', [inst({ family: 'autre' })], start, today), null);
    const g = mergeTotals([a, b]);
    expect(g.billed).toBe(2000);
    expect(g.families).toBe(2);
  });

  it('classe la santé financière', () => {
    expect(siteHealth(95)).toBe('good');
    expect(siteHealth(80)).toBe('watch');
    expect(siteHealth(60)).toBe('risk');
    expect(siteHealth(null)).toBe('none');
  });

  it('calcule la variation', () => {
    expect(pctChange(3450, 3180)).toBe(8.5);
    expect(pctChange(10, 0)).toBeNull();
  });

  it('projette les trois mois suivants', () => {
    const f = forecast(
      [
        inst({ dueDate: d('2027-01-05') }),
        inst({ dueDate: d('2027-02-05'), payments: [{ amount: 300, paidAt: d('2026-12-01') }] }),
        inst({ dueDate: d('2027-04-05') }),
        inst({ dueDate: d('2026-12-20') }),
      ],
      today,
    );
    expect(f).toEqual([
      { month: '2027-01', amount: 1000 },
      { month: '2027-02', amount: 700 },
      { month: '2027-03', amount: 0 },
    ]);
  });
});
