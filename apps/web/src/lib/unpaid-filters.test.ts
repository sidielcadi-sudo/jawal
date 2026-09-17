import { describe, it, expect } from 'vitest';
import {
  filterRows,
  filterScope,
  groupFamilies,
  recoveryDelta,
  rowStatus,
  unpaidKpis,
  type LedgerRow,
} from './unpaid-filters';

const today = new Date('2026-10-15T00:00:00Z');
const d = (s: string) => new Date(`${s}T00:00:00Z`);

const row = (o: Partial<LedgerRow>): LedgerRow => ({
  id: 'i',
  studentId: 's1',
  studentName: 'Alami Yassine',
  familyId: 'f1',
  familyName: 'Alami Hassan',
  guardians: ['Alami Hassan', 'Bennani Salma'],
  yearId: 'y2',
  yearLabel: '2026-2027',
  previous: false,
  cycleId: 'college',
  classId: 'c1',
  label: 'Octobre',
  dueDate: d('2026-10-05'),
  amount: 1000,
  paid: 0,
  payments: [],
  contentious: false,
  ...o,
});

describe('statut d’une échéance', () => {
  it('distingue soldée, échue, non échue et contentieux', () => {
    expect(rowStatus(row({ paid: 1000 }), today)).toBe('PAID');
    expect(rowStatus(row({}), today)).toBe('ECHU');
    expect(rowStatus(row({ dueDate: d('2026-11-05') }), today)).toBe('NON_ECHU');
    expect(rowStatus(row({ contentious: true }), today)).toBe('CONTENTIEUX');
  });
});

describe('filtres', () => {
  const rows = [
    row({ id: 'a' }),
    row({ id: 'b', dueDate: d('2026-11-05') }),
    row({ id: 'c', contentious: true, studentId: 's2', studentName: 'Berrada Youssef', familyId: 'f2', familyName: 'Berrada Karim', guardians: ['Berrada Karim'] }),
    row({ id: 'd', paid: 1000 }),
    row({ id: 'e', cycleId: 'lycee', classId: 'c9' }),
    row({ id: 'f', yearId: 'y1', previous: true, dueDate: d('2026-03-05') }),
  ];
  const ids = (r: LedgerRow[]) => r.map((x) => x.id).sort();

  it('« tous » garde tous les restes à payer, jamais les échéances soldées', () => {
    expect(ids(filterRows(rows, {}, today))).toEqual(['a', 'b', 'c', 'e', 'f']);
  });

  it('filtre par statut', () => {
    expect(ids(filterRows(rows, { status: 'ECHU' }, today))).toEqual(['a', 'e', 'f']);
    expect(ids(filterRows(rows, { status: 'NON_ECHU' }, today))).toEqual(['b']);
    expect(ids(filterRows(rows, { status: 'CONTENTIEUX' }, today))).toEqual(['c']);
  });

  it('filtre par année, cycle, classe et mois', () => {
    expect(ids(filterRows(rows, { yearId: 'y1' }, today))).toEqual(['f']);
    expect(ids(filterRows(rows, { cycleId: 'lycee' }, today))).toEqual(['e']);
    expect(ids(filterRows(rows, { month: '2026-11' }, today))).toEqual(['b']);
    expect(ids(filterScope(rows, { classId: 'c9' }))).toEqual(['e']);
  });

  it('cherche par élève ou par tuteur, sans accents', () => {
    expect(ids(filterRows(rows, { q: 'youssef' }, today))).toEqual(['c']);
    expect(ids(filterRows(rows, { q: 'salma' }, today))).toEqual(['a', 'b', 'e', 'f']);
  });
});

describe('indicateurs', () => {
  const rows = [
    row({ id: 'a', amount: 1000, paid: 1000, payments: [{ amount: 1000, paidAt: d('2026-10-01') }] }),
    row({ id: 'b', amount: 1000, paid: 400, payments: [{ amount: 400, paidAt: d('2026-10-10') }] }),
    row({ id: 'c', amount: 1000, dueDate: d('2026-11-05') }),
    row({ id: 'd', amount: 1000, dueDate: d('2026-12-05'), familyId: 'f2' }),
  ];

  it('chiffre facturé, encaissé, échu, à venir et recouvrement', () => {
    const k = unpaidKpis(rows, today);
    expect(k).toMatchObject({
      billed: 4000,
      collected: 1400,
      collectedPct: 35,
      overdue: 600,
      overdueFamilies: 1,
      upcoming: 2000,
      upcomingMonths: ['2026-11', '2026-12'],
      recoveryRate: 70,
    });
  });

  it('ignore les paiements postérieurs à la date d’arrêté', () => {
    // Au 5 octobre, seul le versement du 1er est connu.
    const k = unpaidKpis(rows, d('2026-10-05'));
    expect(k.collected).toBe(1000);
    expect(k.recoveryRate).toBe(50);
  });

  it('calcule l’écart avec l’année précédente', () => {
    expect(recoveryDelta(76.4, 72.4)).toBe(4);
    expect(recoveryDelta(76.4, null)).toBeNull();
  });
});

describe('regroupement famille → élève → année', () => {
  it('regroupe et marque le contentieux', () => {
    const fams = groupFamilies(
      [row({ id: 'a' }), row({ id: 'b', contentious: true }), row({ id: 'c', yearId: 'y1', yearLabel: '2025-2026', previous: true, dueDate: d('2026-03-01') })],
      today,
      new Map([['y1', 0], ['y2', 1]]),
    );
    expect(fams).toHaveLength(1);
    const s = fams[0]!.students[0]!;
    expect(s.years.map((y) => y.yearLabel)).toEqual(['2025-2026', '2026-2027']);
    expect(s.previousUnpaid).toBe(1000);
    expect((s.years[1] as unknown as { contentious: boolean }).contentious).toBe(true);
    expect(fams[0]!.rowCount).toBe(2);
  });
});
