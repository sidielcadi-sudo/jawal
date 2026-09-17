import { describe, it, expect } from 'vitest';
import {
  coverageRate,
  hourlyRate,
  hoursBetween,
  isReplacementReason,
  sourceOfReason,
  summarizeOvertime,
} from './overtime-hse';

describe('motifs HSE', () => {
  it('rattache chaque motif à sa source comptable', () => {
    expect(sourceOfReason('REPLACE_SICK')).toBe('SUBSTITUTION');
    expect(sourceOfReason('REPLACE_TRAINING')).toBe('SUBSTITUTION');
    expect(sourceOfReason('EXAM_CORRECTION')).toBe('EXAM_SUPERVISION');
    expect(sourceOfReason('SUPPORT')).toBe('PARASCOLAIRE');
    expect(sourceOfReason('CLUB')).toBe('PARASCOLAIRE');
  });

  it('ne demande un professeur remplacé que pour un remplacement', () => {
    expect(isReplacementReason('REPLACE_AUTHORIZED')).toBe(true);
    expect(isReplacementReason('EXAM_SUPERVISION')).toBe(false);
    expect(isReplacementReason(null)).toBe(false);
  });
});

describe('durée', () => {
  it('calcule les heures entre deux horaires', () => {
    expect(hoursBetween('14:00', '16:00')).toBe(2);
    expect(hoursBetween('10:00', '11:30')).toBe(1.5);
  });

  it('refuse un horaire inversé ou mal formé', () => {
    expect(hoursBetween('16:00', '14:00')).toBeNull();
    expect(hoursBetween('9h', '10:00')).toBeNull();
  });
});

describe('indicateurs', () => {
  const month = '2026-10';
  const entries = [
    { hours: 2, status: 'DECLARED', date: '2026-10-14', grossSalary: 10400 },
    { hours: 1.5, status: 'RH_VALIDATED', date: '2026-09-30', grossSalary: 10400 },
    { hours: 2, status: 'DIRECTION_APPROVED', date: '2026-10-08', grossSalary: 10400 },
    { hours: 3, status: 'PROCESSED', date: '2026-10-02', grossSalary: null },
    { hours: 4, status: 'PROCESSED', date: '2026-09-12', grossSalary: 10400 },
    { hours: 1, status: 'REJECTED', date: '2026-10-03', grossSalary: 10400 },
  ];

  it('compte en attente toutes les déclarations non abouties, quel que soit le mois', () => {
    const s = summarizeOvertime(entries, month);
    expect(s.pendingHours).toBe(3.5);
    expect(s.pendingCount).toBe(2);
  });

  it('ne compte comme validées que celles du mois', () => {
    const s = summarizeOvertime(entries, month);
    expect(s.validatedHours).toBe(5);
    expect(s.validatedCount).toBe(2);
  });

  it('chiffre le coût sur le salaire brut, majoration comprise', () => {
    // 10 400 / 26 / 8 = 50 /h ; 2 h × 50 × 1,25 = 125
    const s = summarizeOvertime(entries, month);
    expect(s.cost).toBe(125);
    expect(s.costMissing).toBe(1);
    expect(hourlyRate(10400)).toBe(50);
  });

  it('calcule la couverture des absences', () => {
    expect(coverageRate(43, 4)).toBe(91.5);
    expect(coverageRate(0, 0)).toBeNull();
  });
});
