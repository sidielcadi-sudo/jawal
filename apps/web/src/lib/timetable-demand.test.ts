import { describe, expect, it } from 'vitest';
import { aggregateDemand } from './timetable-demand';

const FR = 'fr';
const PC = 'pc';
const MATH = 'math';

const cls = (
  classId: string,
  className: string,
  subjectHours: Array<[string, number]>,
) => ({ classId, className, subjectHours: subjectHours.map(([subjectId, hours]) => ({ subjectId, hours })) });

describe('aggregateDemand', () => {
  it('somme les heures par matière sur plusieurs classes', () => {
    const r = aggregateDemand(
      [cls('c1', '2AC-A', [[FR, 4], [MATH, 5]]), cls('c2', '2AC-B', [[FR, 4], [MATH, 5]])],
      new Map(),
    );
    expect(r.bySubject.get(FR)).toBe(8);
    expect(r.bySubject.get(MATH)).toBe(10);
    expect(r.totalHours).toBe(18);
  });

  it('compte une matière dédoublée pour autant de séances que de groupes', () => {
    // Deux demi-groupes de français occupent deux profs et deux salles pendant
    // la même heure : c'est bien 6 h de charge, pas 3.
    const r = aggregateDemand([cls('c1', '2AC-A', [[FR, 3]])], new Map([[`c1|${FR}`, 2]]));
    expect(r.bySubject.get(FR)).toBe(6);
    expect(r.rows[0]).toMatchObject({ programHours: 3, groupCount: 2, hours: 6 });
  });

  it('isole les heures ajoutées par les dédoublements', () => {
    const r = aggregateDemand(
      [cls('c1', '2AC-A', [[FR, 3], [PC, 4]])],
      new Map([[`c1|${FR}`, 2]]),
    );
    expect(r.splitExtraHours).toBe(3);
  });

  it('ne double pas l’occupation de la CLASSE — ses élèves sont à un seul endroit', () => {
    const r = aggregateDemand([cls('c1', '2AC-A', [[FR, 3]])], new Map([[`c1|${FR}`, 2]]));
    expect(r.classHours.get('c1')).toBe(3);
    expect(r.bySubject.get(FR)).toBe(6);
  });

  it('traite un groupe unique comme la classe entière', () => {
    // Un seul groupe déclaré n'est pas un dédoublement.
    const r = aggregateDemand([cls('c1', '2AC-A', [[FR, 3]])], new Map([[`c1|${FR}`, 1]]));
    expect(r.bySubject.get(FR)).toBe(3);
    expect(r.splitExtraHours).toBe(0);
  });

  it('n’applique le dédoublement qu’à la matière concernée', () => {
    const r = aggregateDemand(
      [cls('c1', '2AC-A', [[FR, 3], [PC, 4]])],
      new Map([[`c1|${FR}`, 2]]),
    );
    expect(r.bySubject.get(FR)).toBe(6);
    expect(r.bySubject.get(PC)).toBe(4);
  });

  it('n’applique le dédoublement qu’à la classe concernée', () => {
    const r = aggregateDemand(
      [cls('c1', '2AC-A', [[FR, 3]]), cls('c2', '2AC-B', [[FR, 3]])],
      new Map([[`c1|${FR}`, 3]]),
    );
    expect(r.bySubject.get(FR)).toBe(12);
    expect(r.rows.find((x) => x.classId === 'c2')!.groupCount).toBe(1);
  });

  it('gère des programmes différents sur un même niveau', () => {
    // TC Sciences 25 h et TC Lettres 21 h : multiplier UN programme par le
    // nombre de classes du niveau donnerait un total faux.
    const r = aggregateDemand(
      [cls('tcs', 'TCS-A', [[PC, 4]]), cls('tcl', 'TCL-A', [[PC, 1]])],
      new Map(),
    );
    expect(r.bySubject.get(PC)).toBe(5);
  });

  it('rend un résultat vide sans classe', () => {
    const r = aggregateDemand([], new Map());
    expect(r.totalHours).toBe(0);
    expect(r.rows).toEqual([]);
    expect(r.splitExtraHours).toBe(0);
  });

  it('ignore un compte de groupes négatif ou nul', () => {
    const r = aggregateDemand([cls('c1', 'A', [[FR, 3]])], new Map([[`c1|${FR}`, 0]]));
    expect(r.bySubject.get(FR)).toBe(3);
  });
});

describe('aggregateDemand — dédoublement partiel', () => {
  const un = (hours: number) => [cls('c1', '2AC-A', [[FR, hours]])];
  const deuxGroupes = new Map([[`c1|${FR}`, 2]]);

  it('ne multiplie que les heures dédoublées', () => {
    // 3 h de français dont 1 h en demi-groupes : 2 h simples + 1 h × 2 = 4 h.
    const r = aggregateDemand(un(3), deuxGroupes, [], new Map([[`c1|${FR}`, 1]]));
    expect(r.bySubject.get(FR)).toBe(4);
    expect(r.rows[0]).toMatchObject({ programHours: 3, splitHours: 1, groupCount: 2, hours: 4 });
  });

  it("reste sur le dédoublement total quand rien n'est déclaré", () => {
    const r = aggregateDemand(un(3), deuxGroupes, [], new Map());
    expect(r.bySubject.get(FR)).toBe(6);
    expect(r.rows[0]!.splitHours).toBe(3);
  });

  it('traite null comme « toutes les heures »', () => {
    const r = aggregateDemand(un(3), deuxGroupes, [], new Map([[`c1|${FR}`, null]]));
    expect(r.bySubject.get(FR)).toBe(6);
  });

  it('plafonne une part dédoublée supérieure au volume', () => {
    // 5 h dédoublées sur une matière à 3 h est une aberration : on plafonne
    // plutôt que de propager un total faux.
    const r = aggregateDemand(un(3), deuxGroupes, [], new Map([[`c1|${FR}`, 5]]));
    expect(r.bySubject.get(FR)).toBe(6);
    expect(r.rows[0]!.splitHours).toBe(3);
  });

  it('ignore une part dédoublée négative', () => {
    const r = aggregateDemand(un(3), deuxGroupes, [], new Map([[`c1|${FR}`, -2]]));
    expect(r.bySubject.get(FR)).toBe(3);
    expect(r.rows[0]!.splitHours).toBe(0);
  });

  it('ignore la part dédoublée sans dédoublement réel', () => {
    // Un seul groupe : la valeur n'a pas d'objet.
    const r = aggregateDemand(un(3), new Map(), [], new Map([[`c1|${FR}`, 2]]));
    expect(r.bySubject.get(FR)).toBe(3);
    expect(r.rows[0]!.splitHours).toBe(0);
  });

  it("compte l'extra sur la seule part dédoublée", () => {
    const r = aggregateDemand(un(3), deuxGroupes, [], new Map([[`c1|${FR}`, 1]]));
    expect(r.splitExtraHours).toBe(1);
  });

  it("n'affecte pas l'occupation de la classe", () => {
    const r = aggregateDemand(un(3), deuxGroupes, [], new Map([[`c1|${FR}`, 1]]));
    expect(r.classHours.get('c1')).toBe(3);
  });

  it('gère trois groupes sur une heure', () => {
    const trois = new Map([[`c1|${FR}`, 3]]);
    const r = aggregateDemand(un(4), trois, [], new Map([[`c1|${FR}`, 1]]));
    expect(r.bySubject.get(FR)).toBe(6);
  });
});
