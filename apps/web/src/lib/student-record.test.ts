import { describe, it, expect } from 'vitest';
import {
  slotMinutes,
  formatMinutes,
  summarizeAttendance,
  absenceVolume,
  type AttendanceEntry,
} from './student-record';

describe('slotMinutes', () => {
  it('lit les deux écritures d’un intervalle', () => {
    expect(slotMinutes('08:00-09:00')).toBe(60);
    expect(slotMinutes('08h00 - 10h00')).toBe(120);
  });

  it('gère les demi-heures', () => {
    expect(slotMinutes('14:15-15:45')).toBe(90);
  });

  it('ne devine pas ce qui n’est pas un intervalle', () => {
    // Compter « Journée » comme une heure fausserait tous les totaux.
    for (const label of ['Journée', 'Matin', 'Cours 1', '', null, undefined]) {
      expect(slotMinutes(label)).toBeNull();
    }
  });

  it('refuse un intervalle qui ne va pas dans le bon sens', () => {
    expect(slotMinutes('10:00-09:00')).toBeNull();
  });
});

describe('formatMinutes', () => {
  it('écrit les heures rondes sans minutes', () => {
    expect(formatMinutes(120)).toBe('2 h');
  });

  it('garde les minutes quand il y en a', () => {
    expect(formatMinutes(90)).toBe('1 h 30');
  });

  it('reste en minutes sous l’heure', () => {
    expect(formatMinutes(45)).toBe('45 min');
  });
});

const e = (o: Partial<AttendanceEntry> = {}): AttendanceEntry => ({
  status: 'PRESENT',
  periodLabel: '08:00-09:00',
  lateMinutes: null,
  justified: false,
  ...o,
});

describe('summarizeAttendance', () => {
  it('compte les absences en séances et en minutes', () => {
    const r = summarizeAttendance([
      e({ status: 'ABSENT' }),
      e({ status: 'ABSENT', periodLabel: '10:00-12:00' }),
      e(),
    ]);
    expect(r.absences).toBe(2);
    expect(r.absenceMinutes).toBe(180);
  });

  it('isole ce qui n’est pas justifié', () => {
    const r = summarizeAttendance([
      e({ status: 'ABSENT', justified: true }),
      e({ status: 'ABSENT', justified: false }),
    ]);
    expect(r.absences).toBe(2);
    expect(r.unjustifiedAbsences).toBe(1);
    expect(r.unjustifiedMinutes).toBe(60);
  });

  it('cumule les minutes de retard sans les compter en absence', () => {
    const r = summarizeAttendance([
      e({ status: 'LATE', lateMinutes: 15 }),
      e({ status: 'LATE', lateMinutes: 30 }),
    ]);
    expect(r.lates).toBe(2);
    expect(r.lateMinutes).toBe(45);
    expect(r.absences).toBe(0);
  });

  it('compte retards et excusés comme des présences dans le taux', () => {
    const r = summarizeAttendance([
      e(),
      e({ status: 'LATE', lateMinutes: 10 }),
      e({ status: 'EXCUSED' }),
      e({ status: 'ABSENT' }),
    ]);
    expect(r.attendanceRate).toBe(75);
  });

  it('n’additionne pas les créneaux sans horaires', () => {
    // « Journée » n'a pas de durée connue : la séance compte, pas les minutes.
    const r = summarizeAttendance([e({ status: 'ABSENT', periodLabel: 'Journée' })]);
    expect(r.absences).toBe(1);
    expect(r.absenceMinutes).toBe(0);
  });

  it('rend null le taux sur un élève jamais pointé', () => {
    expect(summarizeAttendance([]).attendanceRate).toBeNull();
  });
});

describe('absenceVolume', () => {
  it('affiche des heures dès que les créneaux sont horodatés', () => {
    expect(absenceVolume(3, 180)).toEqual({ value: '3 h', unit: 'hours' });
  });

  it('retombe sur le nombre de séances sans horaires', () => {
    expect(absenceVolume(3, 0)).toEqual({ value: '3', unit: 'sessions' });
  });
});
