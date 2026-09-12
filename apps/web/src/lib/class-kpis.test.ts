import { describe, it, expect } from 'vitest';
import {
  weightedAverage20,
  averageWithDelta,
  attendanceRate,
  settlementRate,
  fillRate,
  kpiTone,
  type GradeRow,
} from './class-kpis';

const g = (o: Partial<GradeRow> = {}): GradeRow => ({
  studentId: 's1',
  value: 10,
  weight: 1,
  maxValue: 20,
  coefficient: 1,
  ...o,
});

describe('weightedAverage20', () => {
  it('normalise les barèmes avant d’additionner', () => {
    // 8/10 et 16/20 valent tous deux 16/20 : la moyenne est 16.
    expect(weightedAverage20([g({ value: 8, maxValue: 10 }), g({ value: 16 })])).toBe(16);
  });

  it('multiplie le poids du devoir par le coefficient de la matière', () => {
    // 20 en coef 4 × poids 2 (=8) contre 10 en coef 1 (=1) → (160+10)/9 = 18.9
    expect(
      weightedAverage20([
        g({ value: 20, weight: 2, coefficient: 4 }),
        g({ value: 10, weight: 1, coefficient: 1 }),
      ]),
    ).toBe(18.9);
  });

  it('ignore une note de poids ou coefficient nul', () => {
    expect(weightedAverage20([g({ value: 20, coefficient: 0 }), g({ value: 10 })])).toBe(10);
  });

  it('ignore un barème absurde plutôt que de diviser par zéro', () => {
    expect(weightedAverage20([g({ value: 5, maxValue: 0 }), g({ value: 12 })])).toBe(12);
  });

  it('rend null sans aucune note exploitable', () => {
    expect(weightedAverage20([])).toBeNull();
  });
});

describe('attendanceRate', () => {
  it('compte retards et excusés comme des présences', () => {
    expect(attendanceRate({ present: 8, absent: 0, late: 1, excused: 1 })).toBe(100);
  });

  it('mesure sur les seuls pointages effectués', () => {
    expect(attendanceRate({ present: 27, absent: 3, late: 0, excused: 0 })).toBe(90);
  });

  it('rend null sur une classe jamais pointée', () => {
    expect(attendanceRate({ present: 0, absent: 0, late: 0, excused: 0 })).toBeNull();
  });
});

describe('fillRate', () => {
  it('calcule le remplissage', () => {
    expect(fillRate(28, 30)).toBe(93.3);
  });

  it('ne parle pas de remplissage sans capacité saisie', () => {
    // Capacité à 0 = paramétrage manquant, pas une classe vide.
    expect(fillRate(28, 0)).toBeNull();
  });
});

describe('averageWithDelta', () => {
  it('compare la classe à l’établissement hors cette classe', () => {
    const classRows = [g({ studentId: 'a', value: 14 }), g({ studentId: 'b', value: 14 })];
    const school = [...classRows, g({ studentId: 'z', value: 10 })];
    const r = averageWithDelta(classRows, school);
    // Référence = 10 (le seul élève extérieur), pas 12,7 (l'ensemble).
    expect(r.average).toBe(14);
    expect(r.delta).toBe(4);
  });

  it('ne prétend pas comparer quand la classe est seule notée', () => {
    const classRows = [g({ studentId: 'a', value: 14 })];
    expect(averageWithDelta(classRows, classRows).delta).toBeNull();
  });

  it('rend un écart négatif sans le masquer', () => {
    const classRows = [g({ studentId: 'a', value: 8 })];
    const school = [...classRows, g({ studentId: 'z', value: 12 })];
    expect(averageWithDelta(classRows, school).delta).toBe(-4);
  });
});

describe('settlementRate', () => {
  it('rapporte l’encaissé aux échéances tombées', () => {
    expect(settlementRate(1000, 750)).toBe(75);
  });

  it('ne parle pas de règlement sans échéance échue', () => {
    expect(settlementRate(0, 0)).toBeNull();
  });
});

describe('kpiTone', () => {
  it('applique les seuils', () => {
    expect(kpiTone(95, 90, 75)).toBe('good');
    expect(kpiTone(80, 90, 75)).toBe('warn');
    expect(kpiTone(50, 90, 75)).toBe('bad');
  });

  it('ne colore pas une valeur absente', () => {
    expect(kpiTone(null, 90, 75)).toBe('none');
  });
});
