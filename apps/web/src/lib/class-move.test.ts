import { describe, it, expect } from 'vitest';
import { checkMove, moveRefusalMessage, type MoveEnrollment, type MoveTarget } from './class-move';

const enr = (o: Partial<MoveEnrollment> = {}): MoveEnrollment => ({
  status: 'ACTIVE',
  academicYearId: 'y1',
  levelId: 'l1',
  trackId: null,
  classId: 'c1',
  ...o,
});

const target = (o: Partial<MoveTarget> = {}): MoveTarget => ({
  id: 'c2',
  academicYearId: 'y1',
  levelId: 'l1',
  trackId: null,
  capacity: 30,
  enrolled: 20,
  ...o,
});

describe('checkMove', () => {
  it('accepte un déplacement vers une classe du même niveau', () => {
    expect(checkMove(enr(), target())).toEqual({ ok: true });
  });

  it('accepte aussi un élève seulement affecté', () => {
    expect(checkMove(enr({ status: 'AFFECTE' }), target())).toEqual({ ok: true });
  });

  it('refuse un dossier pas encore affecté', () => {
    // L'affectation initiale a son propre chemin : la confondre avec un
    // déplacement ferait sauter l'étape de paiement.
    for (const status of ['DRAFT', 'ACCEPTE', 'INSCRIPTION_VALIDEE', 'WITHDRAWN']) {
      expect(checkMove(enr({ status }), target())).toEqual({
        ok: false,
        reason: 'NOT_ASSIGNED_YET',
      });
    }
  });

  it('refuse la classe où l’élève se trouve déjà', () => {
    expect(checkMove(enr({ classId: 'c2' }), target())).toEqual({
      ok: false,
      reason: 'SAME_CLASS',
    });
  });

  it('refuse une classe d’une autre année', () => {
    expect(checkMove(enr(), target({ academicYearId: 'y2' }))).toEqual({
      ok: false,
      reason: 'OTHER_YEAR',
    });
  });

  it('refuse un changement de niveau', () => {
    expect(checkMove(enr(), target({ levelId: 'l2' }))).toEqual({
      ok: false,
      reason: 'OTHER_LEVEL',
    });
  });

  it('refuse un changement de filière', () => {
    expect(checkMove(enr({ trackId: 't1' }), target({ trackId: 't2' }))).toEqual({
      ok: false,
      reason: 'OTHER_TRACK',
    });
  });

  it('n’oppose pas la filière quand la classe n’en a pas', () => {
    // Collège et primaire n'ont pas de filière : la règle ne doit pas s'y
    // appliquer, sinon aucun déplacement n'y serait possible.
    expect(checkMove(enr({ trackId: 't1' }), target({ trackId: null }))).toEqual({ ok: true });
  });

  it('refuse une classe pleine', () => {
    expect(checkMove(enr(), target({ capacity: 30, enrolled: 30 }))).toEqual({
      ok: false,
      reason: 'FULL',
    });
  });

  it('accepte la dernière place', () => {
    expect(checkMove(enr(), target({ capacity: 30, enrolled: 29 }))).toEqual({ ok: true });
  });

  it('vérifie le statut avant tout le reste', () => {
    // Un dossier retiré vers une classe pleine d'une autre année : le message
    // utile est celui du statut, pas celui de la capacité.
    expect(
      checkMove(enr({ status: 'WITHDRAWN' }), target({ academicYearId: 'y9', enrolled: 99 })),
    ).toEqual({ ok: false, reason: 'NOT_ASSIGNED_YET' });
  });
});

describe('moveRefusalMessage', () => {
  it('nomme la capacité quand elle est connue', () => {
    expect(moveRefusalMessage('FULL', 30)).toContain('capacité 30');
    expect(moveRefusalMessage('FULL')).toBe('Classe pleine.');
  });

  it('renvoie vers le bon geste selon le refus', () => {
    expect(moveRefusalMessage('NOT_ASSIGNED_YET')).toContain('Affecter');
    expect(moveRefusalMessage('OTHER_LEVEL')).toContain('réinscription');
    expect(moveRefusalMessage('OTHER_TRACK')).toContain('coefficients');
  });
});
