import { describe, it, expect } from 'vitest';
import { teacherCoversCycle } from './teacher-cycle-rule';

describe('affectation selon les cycles de la fiche', () => {
  it('refuse une classe de lycée à un professeur de collège', () => {
    expect(teacherCoversCycle(['college'], 'lycee')).toBe(false);
  });

  it('accepte une classe de son cycle', () => {
    expect(teacherCoversCycle(new Set(['college']), 'college')).toBe(true);
  });

  it('ouvre les deux cycles quand la fiche les déclare', () => {
    expect(teacherCoversCycle(['college', 'lycee'], 'lycee')).toBe(true);
    expect(teacherCoversCycle(['college', 'lycee'], 'college')).toBe(true);
  });

  it('ne contraint pas une fiche sans cycle renseigné', () => {
    expect(teacherCoversCycle([], 'lycee')).toBe(true);
  });
});
