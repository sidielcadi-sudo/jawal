import { describe, it, expect } from 'vitest';
import {
  averageDelta,
  gradeStats,
  inferEvaluationKind,
  kindFamily,
  matchesSearch,
  summarize,
  trackingStatus,
  type TrackingRow,
} from './grades-tracking';

describe('type d’une évaluation d’après son intitulé', () => {
  it.each([
    ['Examen Blanc #1', 'BLANC'],
    ['Composition du 1er trimestre', 'COMPOSITION'],
    ['Examen mi-trimestre', 'COMPOSITION'],
    ['DST #2 — Mécanique', 'DEVOIR_SURVEILLE'],
    ['DS 3', 'DEVOIR_SURVEILLE'],
    ['Devoir surveillé n°1', 'DEVOIR_SURVEILLE'],
    ['Devoir maison — Géométrie', 'DEVOIR_MAISON'],
    ['DM 4', 'DEVOIR_MAISON'],
    ['Interrogation — Grammaire', 'CONTROLE_CONTINU'],
    ['Contrôle 1', 'CONTROLE_CONTINU'],
  ])('« %s » → %s', (label, kind) => {
    expect(inferEvaluationKind(label)).toBe(kind);
  });

  it('range chaque type dans sa famille', () => {
    expect(kindFamily('CONTROLE_CONTINU')).toBe('CONTROLES');
    expect(kindFamily('DEVOIR_MAISON')).toBe('DEVOIRS');
    expect(kindFamily('SEMESTRIEL')).toBe('INTERNES');
    expect(kindFamily('NATIONAL')).toBe('OFFICIELS');
  });
});

describe('statut d’une épreuve', () => {
  const today = '2026-10-20';

  it('est terminée quand toutes les copies sont saisies', () => {
    expect(trackingStatus({ entered: 32, expected: 32, date: '2026-10-12' }, today)).toBe('DONE');
  });

  it('est à venir tant que la date n’est pas passée', () => {
    expect(trackingStatus({ entered: 0, expected: 30, date: '2026-10-25' }, today)).toBe('UPCOMING');
  });

  it('reste en cours pendant le délai de correction', () => {
    expect(trackingStatus({ entered: 12, expected: 28, date: '2026-10-18' }, today)).toBe('IN_PROGRESS');
    expect(trackingStatus({ entered: 0, expected: 28, date: '2026-10-13' }, today)).toBe('IN_PROGRESS');
  });

  it('passe en retard au-delà du délai', () => {
    expect(trackingStatus({ entered: 0, expected: 30, date: '2026-10-05' }, today)).toBe('LATE');
  });

  it('ne met jamais en retard une épreuve sans élève', () => {
    expect(trackingStatus({ entered: 0, expected: 0, date: '2026-09-01' }, today)).toBe('DONE');
  });
});

const row = (o: Partial<TrackingRow>): TrackingRow => ({
  id: 'r',
  source: 'EVALUATION',
  label: 'Contrôle',
  kind: 'CONTROLE_CONTINU',
  classId: 'c',
  classLabel: '3AC-B',
  subjectLabel: 'Mathématiques',
  teacherLabel: 'Martin',
  date: '2026-10-12',
  coefficient: 1,
  entered: 0,
  expected: 0,
  sum20: 0,
  count: 0,
  passed: 0,
  href: '#',
  status: 'DONE',
  average: null,
  ...o,
});

describe('indicateurs', () => {
  it('pondère la moyenne par note, pas par épreuve', () => {
    const s = summarize([
      row({ sum20: 140, count: 10, passed: 8 }), // 14 de moyenne sur 10 copies
      row({ sum20: 20, count: 2, passed: 0 }), // 10 de moyenne sur 2 copies
    ]);
    expect(s.average).toBe(13.3);
    expect(s.success).toBe(66.7);
  });

  it('compte contrôles et examens séparément', () => {
    const s = summarize([row({}), row({}), row({ source: 'EXAM' })]);
    expect(s).toMatchObject({ total: 3, controls: 2, exams: 1 });
  });

  it('exclut les épreuves à venir de la complétion', () => {
    const s = summarize([
      row({ entered: 30, expected: 32, status: 'IN_PROGRESS' }),
      row({ entered: 0, expected: 30, status: 'UPCOMING' }),
    ]);
    expect(s.completion).toBe(93.8);
  });

  it('compte les retards', () => {
    const s = summarize([row({ status: 'LATE' }), row({ status: 'LATE' }), row({})]);
    expect(s.late).toBe(2);
  });

  it('calcule l’écart avec la période précédente', () => {
    expect(averageDelta(13.6, 13.2)).toBe(0.4);
    expect(averageDelta(13.6, null)).toBeNull();
  });

  it('ramène les notes sur 20 avant de les agréger', () => {
    expect(gradeStats([5, 10, null], 10)).toMatchObject({ count: 2, passed: 2, average: 15 });
  });

  it('cherche sans tenir compte des accents ni de la casse', () => {
    const r = row({ subjectLabel: 'Éducation islamique', teacherLabel: 'Benali' });
    expect(matchesSearch(r, 'education')).toBe(true);
    expect(matchesSearch(r, 'BENALI')).toBe(true);
    expect(matchesSearch(r, 'physique')).toBe(false);
  });
});
