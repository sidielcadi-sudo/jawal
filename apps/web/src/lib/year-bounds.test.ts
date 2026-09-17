import { describe, it, expect } from 'vitest';
import { clampDay, floorDate } from './year-bounds';

describe('bornes de l’année active', () => {
  const start = '2026-09-01';
  const end = '2027-07-15';

  it('laisse passer un jour de l’année', () => {
    expect(clampDay('2026-10-12', start, end)).toBe('2026-10-12');
  });

  it('ramène un jour d’avant la rentrée au premier jour', () => {
    expect(clampDay('2026-06-17', start, end)).toBe(start);
  });

  it('ramène un jour d’après la fin au dernier jour', () => {
    expect(clampDay('2027-08-01', start, end)).toBe(end);
  });

  it('empêche une fenêtre glissante de remonter avant la rentrée', () => {
    const rentree = new Date('2026-09-01T00:00:00Z');
    expect(floorDate(new Date('2026-08-10T00:00:00Z'), rentree)).toEqual(rentree);
    expect(floorDate(new Date('2026-09-20T00:00:00Z'), rentree).toISOString().slice(0, 10)).toBe('2026-09-20');
    expect(floorDate(new Date('2026-08-10T00:00:00Z'), null).toISOString().slice(0, 10)).toBe('2026-08-10');
  });
});
