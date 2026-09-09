import { describe, expect, it } from 'vitest';
import { keepPreviousOnly } from './unpaid';
import type { UnpaidFamilyGroup, UnpaidYearRow } from './unpaid';

const year = (label: string, unpaid: number, previous: boolean, daysLate = 30): UnpaidYearRow => ({
  yearId: label,
  yearLabel: label,
  due: unpaid,
  paid: 0,
  unpaid,
  echeances: [`Scolarité ${label}`],
  daysLate,
  previous,
  items: [
    {
      id: `${label}-1`,
      label: `Scolarité ${label}`,
      dueDate: '2026-01-05T00:00:00.000Z',
      amount: unpaid,
      paid: 0,
      remaining: unpaid,
    },
  ],
});

/** Famille à deux enfants : l'aîné traîne une dette, le cadet est à jour. */
const family = (): UnpaidFamilyGroup => ({
  familyId: 'f1',
  familyName: 'Bennani',
  students: [
    {
      studentId: 's1',
      studentName: 'Bennani Adil',
      years: [year('2025-2026', 1000, true, 400), year('2026-2027', 500, false, 10)],
      unpaid: 1500,
      previousUnpaid: 1000,
      daysLate: 400,
    },
    {
      studentId: 's2',
      studentName: 'Bennani Sara',
      years: [year('2026-2027', 300, false, 5)],
      unpaid: 300,
      previousUnpaid: 0,
      daysLate: 5,
    },
  ],
  unpaid: 1800,
  previousUnpaid: 1000,
  daysLate: 400,
  rowCount: 3,
});

describe('keepPreviousOnly', () => {
  it("retire les années de l'exercice en cours", () => {
    const f = keepPreviousOnly([family()])[0]!;
    expect(f.students).toHaveLength(1);
    expect(f.students[0]!.years.map((y) => y.yearLabel)).toEqual(['2025-2026']);
  });

  it('retire les élèves qui ne doivent que sur l’année en cours', () => {
    const f = keepPreviousOnly([family()])[0]!;
    expect(f.students.map((s) => s.studentName)).toEqual(['Bennani Adil']);
  });

  it('recalcule les totaux sur les seules lignes conservées', () => {
    // Sans ce recalcul, l'écran afficherait 1 800 MAD au-dessus d'un tableau
    // qui n'en montre que 1 000.
    const f = keepPreviousOnly([family()])[0]!;
    expect(f.unpaid).toBe(1000);
    expect(f.previousUnpaid).toBe(1000);
    expect(f.students[0]!.unpaid).toBe(1000);
  });

  it('met à jour rowCount, qui pilote le rowSpan du tableau', () => {
    const f = keepPreviousOnly([family()])[0]!;
    expect(f.rowCount).toBe(1);
  });

  it('reprend le plus grand retard parmi les lignes restantes', () => {
    const f = keepPreviousOnly([family()])[0]!;
    expect(f.daysLate).toBe(400);
  });

  it('écarte une famille sans aucune créance antérieure', () => {
    const f = family();
    f.students = [f.students[1]!];
    f.previousUnpaid = 0;
    expect(keepPreviousOnly([f])).toEqual([]);
  });

  it('ne modifie pas la donnée reçue', () => {
    const src = family();
    keepPreviousOnly([src]);
    expect(src.students).toHaveLength(2);
    expect(src.unpaid).toBe(1800);
    expect(src.students[0]!.years).toHaveLength(2);
  });

  it('rend une liste vide pour une liste vide', () => {
    expect(keepPreviousOnly([])).toEqual([]);
  });
});
