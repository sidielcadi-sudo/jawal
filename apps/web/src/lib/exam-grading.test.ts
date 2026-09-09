import { describe, expect, it } from 'vitest';
import {
  areWeightsValid,
  combineAverage,
  DEFAULT_WEIGHTS,
  generalAverage,
  weightsTotal,
  type ResolvedCoefficient,
} from './exam-grading';

const coef = (subjectId: string, coefficient: number): [string, ResolvedCoefficient] => [
  subjectId,
  { subjectId, coefficient, source: 'TRACK', certifying: false },
];

describe('barèmes réglementaires', () => {
  it('les trois barèmes officiels bouclent à 100 %', () => {
    for (const w of Object.values(DEFAULT_WEIGHTS)) {
      expect(weightsTotal(w)).toBe(100);
      expect(areWeightsValid(w)).toBe(true);
    }
  });

  it('refuse un barème qui ne fait pas 100 %', () => {
    expect(areWeightsValid({ cc: 30, semester: 30, regional: 30, national: 0 })).toBe(false);
    expect(areWeightsValid({ cc: -10, semester: 60, regional: 50, national: 0 })).toBe(false);
  });
});

describe('combineAverage', () => {
  it('Tronc commun : 40 % CC + 60 % semestriel', () => {
    const r = combineAverage(
      { cc: 10, semester: 15, regional: null, national: null },
      DEFAULT_WEIGHTS.TRONC_COMMUN,
    );
    // 10*0.4 + 15*0.6 = 13
    expect(r.value).toBe(13);
    expect(r.coveragePct).toBe(100);
    expect(r.missing).toEqual([]);
  });

  it('2BAC : 20 % CC + 30 % semestriel + 50 % national', () => {
    const r = combineAverage(
      { cc: 12, semester: 10, regional: null, national: 16 },
      DEFAULT_WEIGHTS.BAC2,
    );
    // 12*0.2 + 10*0.3 + 16*0.5 = 2.4 + 3 + 8 = 13.4
    expect(r.value).toBe(13.4);
    expect(r.coveragePct).toBe(100);
  });

  it('renormalise quand une composante manque au lieu de compter zéro', () => {
    // 1BAC, régional pas encore passé : on juge sur CC+semestriel seuls.
    const r = combineAverage(
      { cc: 12, semester: 14, regional: null, national: null },
      DEFAULT_WEIGHTS.BAC1,
    );
    // (12*30 + 14*40) / 70 = (360 + 560) / 70 = 13.142857…
    expect(r.value).toBe(13.14);
    expect(r.coveragePct).toBe(70);
    expect(r.missing).toEqual(['regional']);
  });

  it('ignore les composantes hors barème du niveau', () => {
    // Une note de national saisie par erreur en Tronc commun ne doit pas peser.
    const r = combineAverage(
      { cc: 10, semester: 10, regional: null, national: 20 },
      DEFAULT_WEIGHTS.TRONC_COMMUN,
    );
    expect(r.value).toBe(10);
    expect(r.used.map((u) => u.key)).toEqual(['cc', 'semester']);
  });

  it('rend null si aucune composante n’est disponible', () => {
    const r = combineAverage(
      { cc: null, semester: null, regional: null, national: null },
      DEFAULT_WEIGHTS.BAC2,
    );
    expect(r.value).toBeNull();
    expect(r.coveragePct).toBe(0);
  });
});

describe('generalAverage', () => {
  it('pondère par le coefficient de la filière', () => {
    // 2BAC SMA : maths 9, physique 7, français 3.
    const coefficients = new Map([coef('math', 9), coef('pc', 7), coef('fr', 3)]);
    const r = generalAverage(
      [
        { subjectId: 'math', average: 16 },
        { subjectId: 'pc', average: 12 },
        { subjectId: 'fr', average: 8 },
      ],
      coefficients,
    );
    // (16*9 + 12*7 + 8*3) / 19 = (144 + 84 + 24) / 19 = 252/19 = 13.263…
    expect(r.value).toBe(13.26);
    expect(r.totalCoefficient).toBe(19);
  });

  it('la même copie ne donne pas la même moyenne selon la filière', () => {
    const marks = [
      { subjectId: 'math', average: 18 },
      { subjectId: 'ar', average: 8 },
    ];
    // SMA : maths 9, arabe 2 → tiré vers le haut.
    const sma = generalAverage(marks, new Map([coef('math', 9), coef('ar', 2)]));
    // Lettres : arabe 8, maths 2 → tiré vers le bas.
    const lettres = generalAverage(marks, new Map([coef('math', 2), coef('ar', 8)]));
    expect(sma.value).toBeGreaterThan(lettres.value!);
    expect(sma.value).toBe(16.18); // (18*9 + 8*2)/11
    expect(lettres.value).toBe(10); // (18*2 + 8*8)/10
  });

  it('exclut les matières sans note du numérateur ET du dénominateur', () => {
    const coefficients = new Map([coef('math', 9), coef('pc', 7)]);
    const r = generalAverage(
      [
        { subjectId: 'math', average: 14 },
        { subjectId: 'pc', average: null },
      ],
      coefficients,
    );
    expect(r.value).toBe(14);
    expect(r.totalCoefficient).toBe(9);
  });

  it('rend null quand aucune matière n’est notée', () => {
    const r = generalAverage([{ subjectId: 'math', average: null }], new Map([coef('math', 9)]));
    expect(r.value).toBeNull();
  });
});
