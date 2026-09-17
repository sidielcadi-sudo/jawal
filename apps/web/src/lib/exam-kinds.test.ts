import { describe, it, expect } from 'vitest';
import {
  EXAM_KIND_GROUPS,
  SELECTABLE_EXAM_KINDS,
  isExamKind,
  isOfficialKind,
  sessionEditLock,
} from './exam-kinds';

describe('types d’épreuves', () => {
  it('range les types en quatre familles, dans l’ordre demandé', () => {
    expect(EXAM_KIND_GROUPS.map((g) => g.key)).toEqual([
      'CONTROLES',
      'DEVOIRS',
      'INTERNES',
      'OFFICIELS',
    ]);
  });

  it('ne propose plus l’ancien « semestriel », mais l’accepte encore', () => {
    expect(SELECTABLE_EXAM_KINDS).not.toContain('SEMESTRIEL');
    expect(isExamKind('SEMESTRIEL')).toBe(true);
    expect(isExamKind('INCONNU')).toBe(false);
  });

  it('ne tient pour officiels que le régional et le national', () => {
    expect(isOfficialKind('REGIONAL')).toBe(true);
    expect(isOfficialKind('NATIONAL')).toBe(true);
    expect(isOfficialKind('BLANC')).toBe(false);
    expect(isOfficialKind('CONTROLE_CONTINU')).toBe(false);
  });
});

describe('verrou de modification d’une session', () => {
  const open = { status: 'DRAFT', markCount: 0, endDate: '2026-10-20' };

  it('laisse modifier une session sans note et à venir', () => {
    expect(sessionEditLock(open, '2026-10-01')).toBeNull();
  });

  it('reste modifiable le jour même de la fin', () => {
    expect(sessionEditLock(open, '2026-10-20')).toBeNull();
  });

  it('verrouille dès qu’une note est saisie', () => {
    expect(sessionEditLock({ ...open, markCount: 1 }, '2026-10-01')).toBe('MARKS');
  });

  it('verrouille une fois la date échue', () => {
    expect(sessionEditLock(open, '2026-10-21')).toBe('PAST');
  });

  it('verrouille une session clôturée, quoi qu’il arrive', () => {
    expect(sessionEditLock({ ...open, status: 'CLOSED' }, '2026-10-01')).toBe('CLOSED');
  });

  it('lit une date de base (minuit UTC) au bon jour', () => {
    const endDate = new Date('2026-10-20T00:00:00.000Z');
    expect(sessionEditLock({ ...open, endDate }, '2026-10-20')).toBeNull();
    expect(sessionEditLock({ ...open, endDate }, '2026-10-21')).toBe('PAST');
  });
});
