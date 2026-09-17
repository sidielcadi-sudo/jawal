import { describe, it, expect } from 'vitest';
import { presenceFromAppel, readStaffAttendanceSettings } from './staff-presence-from-appel';

describe('réglage « l’appel vaut pointage »', () => {
  it('est désactivé par défaut', () => {
    expect(readStaffAttendanceSettings(null).appelCountsAsPresence).toBe(false);
    expect(readStaffAttendanceSettings({}).appelCountsAsPresence).toBe(false);
    expect(readStaffAttendanceSettings({ staffAttendance: {} }).appelCountsAsPresence).toBe(false);
  });

  it('s’active explicitement', () => {
    expect(
      readStaffAttendanceSettings({ staffAttendance: { appelCountsAsPresence: true } }).appelCountsAsPresence,
    ).toBe(true);
  });
});

describe('effet de l’appel sur le pointage', () => {
  const at = new Date('2026-10-14T08:05:00Z');

  it('crée la présence quand rien n’est pointé', () => {
    expect(presenceFromAppel(null, true)).toBe('create');
    expect(presenceFromAppel(null, false)).toBe('create');
  });

  it('ajoute l’heure d’arrivée à une présence saisie sans heure, le jour même', () => {
    expect(presenceFromAppel({ status: 'PRESENT', checkIn: null }, true)).toBe('check-in');
    expect(presenceFromAppel({ status: 'LATE', checkIn: null }, true)).toBe('check-in');
  });

  it('ne remplace jamais une absence ou un congé saisis par l’administration', () => {
    expect(presenceFromAppel({ status: 'ABSENT', checkIn: null }, true)).toBe('skip');
    expect(presenceFromAppel({ status: 'LEAVE', checkIn: null }, true)).toBe('skip');
  });

  it('ne réécrit pas une heure d’arrivée déjà connue', () => {
    expect(presenceFromAppel({ status: 'PRESENT', checkIn: at }, true)).toBe('skip');
  });

  it('n’invente pas d’heure pour un appel rattrapé un autre jour', () => {
    expect(presenceFromAppel({ status: 'PRESENT', checkIn: null }, false)).toBe('skip');
  });
});
