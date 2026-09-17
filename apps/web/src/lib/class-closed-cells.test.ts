import { describe, it, expect } from 'vitest';
import { classClosedCells, cellKey } from './class-closed-cells';

const slots = [
  { id: 's1', startTime: '08:00', endTime: '09:00' },
  { id: 's2', startTime: '11:15', endTime: '12:15' },
  { id: 'pause', startTime: '12:15', endTime: '14:00', isBreak: true },
  { id: 's3', startTime: '14:00', endTime: '15:00' },
];
const days = ['MON', 'WED'];
const base = { slots, days, cycleSettings: null, tenantSettings: null, classMetadata: null };

describe('classClosedCells', () => {
  it('n’ouvre rien de fermé quand rien n’est paramétré', () => {
    const closed = classClosedCells(base);
    expect(closed.size).toBe(0);
  });

  it('ferme l’après-midi d’un jour déclaré « matin seulement »', () => {
    // Le cas qui faisait échouer la génération : mercredi après-midi au collège.
    const closed = classClosedCells({
      ...base,
      cycleSettings: { timetable: { days: { WED: 'MORNING_ONLY' }, morningEndsAt: '12:15' } },
    });
    expect(closed.has(cellKey('WED', 's3'))).toBe(true);
    expect(closed.has(cellKey('WED', 's2'))).toBe(false);
    expect(closed.has(cellKey('MON', 's3'))).toBe(false);
  });

  it('retient le paramétrage du cycle plutôt que celui de l’établissement', () => {
    const closed = classClosedCells({
      ...base,
      cycleSettings: { timetable: { days: { WED: 'FULL' } } },
      tenantSettings: { timetable: { days: { WED: 'OFF' } } },
    });
    expect(closed.has(cellKey('WED', 's1'))).toBe(false);
  });

  it('retombe sur l’établissement quand le cycle ne dit rien', () => {
    const closed = classClosedCells({
      ...base,
      tenantSettings: { timetable: { days: { WED: 'OFF' } } },
    });
    expect(closed.has(cellKey('WED', 's1'))).toBe(true);
    expect(closed.has(cellKey('MON', 's1'))).toBe(false);
  });

  it('ajoute les jours et cases fermés propres à la classe', () => {
    const closed = classClosedCells({
      ...base,
      classMetadata: {
        timetableConstraints: {
          forbiddenDays: ['MON'],
          forbiddenSlots: [{ day: 'WED', slotId: '11111111-1111-4111-8111-111111111111' }],
        },
      },
    });
    expect(closed.has(cellKey('MON', 's1'))).toBe(true);
    expect(closed.has(cellKey('WED', 's1'))).toBe(false);
  });

  it('ignore les pauses', () => {
    // Une récréation n'est pas une case « fermée » : elle n'est pas une case.
    const closed = classClosedCells({
      ...base,
      tenantSettings: { timetable: { days: { MON: 'OFF', WED: 'OFF' } } },
    });
    expect([...closed].some((k) => k.endsWith('|pause'))).toBe(false);
  });
});
