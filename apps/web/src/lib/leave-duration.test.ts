import { describe, it, expect } from 'vitest';
import { leaveDays, slotInPart } from './leave-duration';

describe('durée d’une absence', () => {
  it('compte les jours pleins par défaut', () => {
    expect(leaveDays(3, 'FULL')).toBe(3);
  });

  it('compte une demi-journée par jour ouvré', () => {
    expect(leaveDays(1, 'AM')).toBe(0.5);
    expect(leaveDays(3, 'PM')).toBe(1.5);
  });

  it('convertit les séances en jours', () => {
    expect(leaveDays(1, 'SESSIONS', 3)).toBe(0.5);
    expect(leaveDays(1, 'SESSIONS', 2)).toBe(0.33);
    expect(leaveDays(1, 'SESSIONS', null)).toBe(0);
  });
});

describe('séances concernées', () => {
  it('sépare matin et après-midi à midi', () => {
    expect(slotInPart('08:00', 'AM')).toBe(true);
    expect(slotInPart('12:00', 'AM')).toBe(false);
    expect(slotInPart('14:00', 'PM')).toBe(true);
    expect(slotInPart('11:15', 'PM')).toBe(false);
  });

  it('garde toutes les séances sur une journée entière', () => {
    expect(slotInPart('08:00', 'FULL')).toBe(true);
    expect(slotInPart('16:00', 'FULL')).toBe(true);
  });
});
