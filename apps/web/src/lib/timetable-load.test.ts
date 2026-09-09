import { describe, expect, it } from 'vitest';
import {
  buildLoadReport,
  explainEmptyLoad,
  resolveWeeklyHours,
  type AssignmentInput,
} from './timetable-load';

const FR = 'subj-fr';
const PC = 'subj-pc';
const EPS = 'subj-eps';

const assign = (subjectId: string, label: string, hoursPerWeek: number | null = null): AssignmentInput => ({
  id: `a-${subjectId}`,
  teacherId: 't1',
  subjectId,
  subjectLabel: label,
  hoursPerWeek,
});

const map = (entries: Array<[string, number | null]>) => new Map(entries);

describe('resolveWeeklyHours', () => {
  it("retient le volume saisi sur l'affectation avant tout le reste", () => {
    const r = resolveWeeklyHours(assign(FR, 'Français', 5), map([[FR, 3]]), map([[FR, 4]]));
    expect(r).toMatchObject({ hours: 5, source: 'ASSIGNMENT' });
  });

  it('retient la filière quand la classe en a une', () => {
    const r = resolveWeeklyHours(assign(FR, 'Français'), map([[FR, 3]]), map([[FR, 4]]));
    expect(r).toMatchObject({ hours: 3, source: 'TRACK' });
  });

  it('retombe sur le programme du niveau sans filière', () => {
    const r = resolveWeeklyHours(assign(FR, 'Français'), null, map([[FR, 4]]));
    expect(r).toMatchObject({ hours: 4, source: 'CURRICULUM' });
  });

  it('retombe sur le niveau si la filière ne dit rien de cette matière', () => {
    // Une filière peut ne pas couvrir toutes les matières enseignées.
    const r = resolveWeeklyHours(assign(EPS, 'EPS'), map([[FR, 3]]), map([[EPS, 2]]));
    expect(r).toMatchObject({ hours: 2, source: 'CURRICULUM' });
  });

  it('rend 0 h et le signale quand aucune source ne déclare la matière', () => {
    const r = resolveWeeklyHours(assign(PC, 'Physique-Chimie'), map([]), map([]));
    expect(r).toMatchObject({ hours: 0, source: 'NONE' });
  });

  it('distingue un 0 h déclaré d’une absence de déclaration', () => {
    // « Assiduité et conduite » est à 0 h au programme : c'est une décision,
    // pas un oubli. La source doit le dire.
    const r = resolveWeeklyHours(assign(EPS, 'Assiduité'), map([[EPS, 0]]), map([]));
    expect(r).toMatchObject({ hours: 0, source: 'TRACK' });
  });

  it('arrondit et refuse les volumes négatifs', () => {
    expect(resolveWeeklyHours(assign(FR, 'Français'), null, map([[FR, 2.4]])).hours).toBe(2);
    expect(resolveWeeklyHours(assign(FR, 'Français'), null, map([[FR, 2.6]])).hours).toBe(3);
    expect(resolveWeeklyHours(assign(FR, 'Français'), null, map([[FR, -3]])).hours).toBe(0);
  });

  it('traite un volume nul dans la source comme non déclaré et poursuit la cascade', () => {
    // `null` en base = « non renseigné » ; la cascade doit continuer.
    const r = resolveWeeklyHours(assign(FR, 'Français'), map([[FR, null]]), map([[FR, 4]]));
    expect(r).toMatchObject({ hours: 4, source: 'CURRICULUM' });
  });
});

describe('buildLoadReport', () => {
  const rows = [assign(FR, 'Français'), assign(PC, 'Physique-Chimie'), assign(EPS, 'EPS')];

  it('totalise les heures à placer', () => {
    const rep = buildLoadReport(rows, map([[FR, 3], [PC, 4], [EPS, 2]]), map([]));
    expect(rep.totalHours).toBe(9);
  });

  it('ne remonte comme manquantes que les matières sans aucune source', () => {
    const rep = buildLoadReport(rows, map([[FR, 3], [PC, 0]]), map([]));
    expect(rep.missing.map((m) => m.subjectLabel)).toEqual(['EPS']);
  });

  it('ne signale rien quand tout est déclaré', () => {
    const rep = buildLoadReport(rows, map([[FR, 3], [PC, 4], [EPS, 2]]), map([]));
    expect(rep.missing).toEqual([]);
  });

  it('couvre le cas collège : pas de filière, tout vient du niveau', () => {
    const rep = buildLoadReport(rows, null, map([[FR, 4], [PC, 3], [EPS, 2]]));
    expect(rep.totalHours).toBe(9);
    expect(rep.rows.every((r) => r.source === 'CURRICULUM')).toBe(true);
  });
});

describe('explainEmptyLoad', () => {
  it('nomme la filière manquante en priorité — c’est la cause la plus fréquente au lycée', () => {
    const msg = explainEmptyLoad({ hasTrack: false, isLycee: true, missingCount: 3 });
    expect(msg).toContain('filière');
  });

  it('renvoie au programme quand des matières ne sont déclarées nulle part', () => {
    const msg = explainEmptyLoad({ hasTrack: true, isLycee: true, missingCount: 3 });
    expect(msg).toContain('Programme par niveau');
  });

  it('dit clairement que tout est à 0 h quand rien ne manque', () => {
    const msg = explainEmptyLoad({ hasTrack: true, isLycee: false, missingCount: 0 });
    expect(msg).toContain('0 h');
  });
});
