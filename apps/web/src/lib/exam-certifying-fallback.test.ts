import { describe, it, expect } from 'vitest';
import {
  certifyingFallback,
  CERTIFYING_PAPER_GROUP,
  DEFAULT_CERTIFYING_DURATION_MIN,
} from './exam-certifying-fallback';

const row = (trackId: string, subjectId: string, certifying = true) => ({
  trackId,
  subjectId,
  certifying,
  subject: { label: subjectId },
});

describe('épreuves déduites des matières certificatives', () => {
  it('propose les matières certificatives d’une filière sans maquette', () => {
    // Le cas du régional 1BAC : aucune maquette, mais Arabe et Français
    // marqués certificatifs dans le paramétrage.
    const out = certifyingFallback(
      [row('sma', 'arabe'), row('sma', 'francais'), row('sma', 'maths', false)],
      new Set(),
    );
    expect(out.map((o) => o.subjectId)).toEqual(['arabe', 'francais']);
    expect(out.every((o) => o.durationMin === DEFAULT_CERTIFYING_DURATION_MIN)).toBe(true);
  });

  it('ne remplace jamais une maquette existante', () => {
    const out = certifyingFallback([row('2bac-sma', 'arabe')], new Set(['2bac-sma']));
    expect(out).toHaveLength(0);
  });

  it('donne le même groupe de sujet à une matière de plusieurs filières', () => {
    // Une épreuve régionale d'Arabe, pas une par filière.
    const out = certifyingFallback([row('sma', 'arabe'), row('sp', 'arabe')], new Set());
    expect(new Set(out.map((o) => o.paperGroup))).toEqual(new Set([CERTIFYING_PAPER_GROUP]));
  });
});
