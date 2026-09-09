import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DEBT_WAIVER_POLICY,
  isPreviousYearDue,
  isWaiveOpen,
  isWaiveOpenForDueDate,
  readDebtWaiverPolicy,
  waiverWindowStart,
  type DebtWaiverPolicy,
  type YearWindow,
} from './school-year';

/** Année active 2026-2027 : 1er septembre 2026 → 30 juin 2027. */
const YEAR: YearWindow = {
  id: 'y2026',
  label: '2026-2027',
  startDate: new Date('2026-09-01T00:00:00Z'),
  endDate: new Date('2027-06-30T00:00:00Z'),
};

const END_OF_YEAR: DebtWaiverPolicy = { mode: 'END_OF_YEAR', windowDays: 30 };
const ANYTIME: DebtWaiverPolicy = { mode: 'ANYTIME', windowDays: 30 };

/** Une échéance de l'exercice précédent (décembre 2025). */
const DUE_PREVIOUS = new Date('2025-12-05T00:00:00Z');
/** Une échéance de l'année active (décembre 2026). */
const DUE_CURRENT = new Date('2026-12-05T00:00:00Z');

describe('isPreviousYearDue', () => {
  it('classe en exercice antérieur une échéance tombée avant la rentrée', () => {
    expect(isPreviousYearDue(YEAR, DUE_PREVIOUS)).toBe(true);
  });

  it("garde dans l'exercice courant une échéance postérieure à la rentrée", () => {
    expect(isPreviousYearDue(YEAR, DUE_CURRENT)).toBe(false);
  });

  it('ne classe rien en antérieur sans année active', () => {
    expect(isPreviousYearDue(null, DUE_PREVIOUS)).toBe(false);
  });

  it("traite la rentrée elle-même comme l'année en cours", () => {
    expect(isPreviousYearDue(YEAR, YEAR.startDate)).toBe(false);
  });
});

describe('isWaiveOpenForDueDate — année en cours', () => {
  const inTheYear = new Date('2027-01-15T00:00:00Z'); // loin de la fin
  const inTheWindow = new Date('2027-06-20T00:00:00Z'); // dans les 30 derniers jours

  it("refuse l'effacement en pleine année scolaire", () => {
    expect(isWaiveOpenForDueDate(YEAR, END_OF_YEAR, DUE_CURRENT, inTheYear)).toBe(false);
  });

  it("l'autorise une fois la fenêtre de fin d'année ouverte", () => {
    expect(isWaiveOpenForDueDate(YEAR, END_OF_YEAR, DUE_CURRENT, inTheWindow)).toBe(true);
  });

  it("l'autorise après la fin de l'année", () => {
    const after = new Date('2027-08-01T00:00:00Z');
    expect(isWaiveOpenForDueDate(YEAR, END_OF_YEAR, DUE_CURRENT, after)).toBe(true);
  });
});

describe('isWaiveOpenForDueDate — exercices antérieurs', () => {
  const inTheYear = new Date('2027-01-15T00:00:00Z');

  it("autorise l'effacement d'une créance antérieure en pleine année", () => {
    // C'est toute la nuance : la fenêtre protège l'exercice en cours, pas les
    // dettes reportées d'un exercice clos.
    expect(isWaiveOpenForDueDate(YEAR, END_OF_YEAR, DUE_PREVIOUS, inTheYear)).toBe(true);
  });

  it("n'ouvre rien sans année active — « antérieur » n'a plus de sens", () => {
    expect(isWaiveOpenForDueDate(null, END_OF_YEAR, DUE_PREVIOUS, inTheYear)).toBe(false);
  });

  it('reste ouvert en mode ANYTIME, année active ou non', () => {
    expect(isWaiveOpenForDueDate(YEAR, ANYTIME, DUE_CURRENT, inTheYear)).toBe(true);
    expect(isWaiveOpenForDueDate(null, ANYTIME, DUE_PREVIOUS, inTheYear)).toBe(true);
  });
});

describe('fenêtre de fin d’année', () => {
  it('ouvre windowDays avant la fin de l’année', () => {
    const start = waiverWindowStart(YEAR, END_OF_YEAR);
    expect(start?.toISOString().slice(0, 10)).toBe('2027-05-31');
  });

  it('n’a pas de borne en mode ANYTIME', () => {
    expect(waiverWindowStart(YEAR, ANYTIME)).toBeNull();
  });

  it('ferme par défaut sans année active en mode END_OF_YEAR', () => {
    expect(isWaiveOpen(null, END_OF_YEAR, new Date('2027-06-20T00:00:00Z'))).toBe(false);
  });
});

describe('readDebtWaiverPolicy', () => {
  it('retombe sur la politique prudente si le réglage est absent ou illisible', () => {
    expect(readDebtWaiverPolicy(null)).toEqual(DEFAULT_DEBT_WAIVER_POLICY);
    expect(readDebtWaiverPolicy({})).toEqual(DEFAULT_DEBT_WAIVER_POLICY);
    expect(readDebtWaiverPolicy({ debtWaiver: 'oui' })).toEqual(DEFAULT_DEBT_WAIVER_POLICY);
  });

  it('lit un réglage valide', () => {
    expect(readDebtWaiverPolicy({ debtWaiver: { mode: 'ANYTIME', windowDays: 10 } })).toEqual({
      mode: 'ANYTIME',
      windowDays: 10,
    });
  });

  it('ignore une largeur de fenêtre hors bornes', () => {
    expect(readDebtWaiverPolicy({ debtWaiver: { mode: 'END_OF_YEAR', windowDays: 0 } })).toEqual(
      DEFAULT_DEBT_WAIVER_POLICY,
    );
    expect(readDebtWaiverPolicy({ debtWaiver: { mode: 'END_OF_YEAR', windowDays: 900 } })).toEqual(
      DEFAULT_DEBT_WAIVER_POLICY,
    );
  });
});
