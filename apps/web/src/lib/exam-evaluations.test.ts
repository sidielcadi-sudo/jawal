import { describe, it, expect } from 'vitest';
import { generatesEvaluations, periodForPaper } from './exam-evaluations';

const periods = [
  { id: 't1', startDate: new Date('2026-09-01T00:00:00Z'), endDate: new Date('2026-12-20T00:00:00Z') },
  { id: 't2', startDate: new Date('2027-01-05T00:00:00Z'), endDate: new Date('2027-03-28T00:00:00Z') },
];

describe('devoirs générés depuis une session d’examen', () => {
  it('génère pour les examens internes, pas pour les officiels', () => {
    expect(generatesEvaluations('COMPOSITION')).toBe(true);
    expect(generatesEvaluations('CONTROLE_CONTINU')).toBe(true);
    expect(generatesEvaluations('BLANC')).toBe(true);
    expect(generatesEvaluations('REGIONAL')).toBe(false);
    expect(generatesEvaluations('NATIONAL')).toBe(false);
  });

  it('rattache le devoir à la période de la session si elle est précisée', () => {
    expect(periodForPaper(new Date('2027-01-10T00:00:00Z'), 't1', periods)).toBe('t1');
  });

  it('sinon, à la période qui contient la date de l’épreuve', () => {
    expect(periodForPaper(new Date('2026-09-15T00:00:00Z'), null, periods)).toBe('t1');
    expect(periodForPaper(new Date('2027-02-01T00:00:00Z'), null, periods)).toBe('t2');
  });

  it('ne rattache rien pendant les vacances entre deux périodes', () => {
    expect(periodForPaper(new Date('2026-12-28T00:00:00Z'), null, periods)).toBeNull();
  });
});
