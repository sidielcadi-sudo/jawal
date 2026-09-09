import { describe, expect, it } from 'vitest';
import {
  checkSlotComposition,
  findGroupOverlaps,
  findTeacherClash,
  findUncoveredStudents,
  splitIntoGroups,
  type GroupShape,
} from './class-groups';

const FR = 'subj-fr';
const PC = 'subj-pc';

const group = (id: string, subjectId: string | null, memberIds: string[]): GroupShape => ({
  id,
  name: id,
  subjectId,
  memberIds,
});

describe('findGroupOverlaps', () => {
  it('ne signale rien sur un dédoublement propre', () => {
    const groups = [group('fr1', FR, ['a', 'b']), group('fr2', FR, ['c', 'd'])];
    expect(findGroupOverlaps(groups)).toEqual([]);
  });

  it('signale un élève présent dans deux groupes de la même matière', () => {
    const groups = [group('fr1', FR, ['a', 'b']), group('fr2', FR, ['b', 'c'])];
    expect(findGroupOverlaps(groups)).toEqual([
      { studentId: 'b', subjectId: FR, groupIds: ['fr1', 'fr2'] },
    ]);
  });

  it('accepte le même élève dans des groupes de matières différentes', () => {
    // Cas courant : l'élève est en français gr1 et en physique gr2.
    const groups = [group('fr1', FR, ['a']), group('pc2', PC, ['a'])];
    expect(findGroupOverlaps(groups)).toEqual([]);
  });

  it('traite les groupes polyvalents comme une famille à part', () => {
    const groups = [group('gA', null, ['a']), group('gB', null, ['a']), group('fr1', FR, ['a'])];
    expect(findGroupOverlaps(groups)).toEqual([
      { studentId: 'a', subjectId: null, groupIds: ['gA', 'gB'] },
    ]);
  });
});

describe('findUncoveredStudents', () => {
  const classe = ['a', 'b', 'c', 'd'];

  it('nomme les élèves qu’aucun groupe ne contient', () => {
    const groups = [group('fr1', FR, ['a']), group('fr2', FR, ['b'])];
    expect(findUncoveredStudents(classe, groups, FR)).toEqual(['c', 'd']);
  });

  it('ne signale rien quand la couverture est complète', () => {
    const groups = [group('fr1', FR, ['a', 'b']), group('fr2', FR, ['c', 'd'])];
    expect(findUncoveredStudents(classe, groups, FR)).toEqual([]);
  });

  it('ne réclame rien pour une matière sans groupe — elle se fait en classe entière', () => {
    const groups = [group('fr1', FR, ['a', 'b'])];
    expect(findUncoveredStudents(classe, groups, PC)).toEqual([]);
  });

  it('ignore les groupes des autres matières dans le calcul', () => {
    const groups = [group('fr1', FR, ['a', 'b']), group('pc1', PC, ['c', 'd'])];
    expect(findUncoveredStudents(classe, groups, FR)).toEqual(['c', 'd']);
  });
});

describe('checkSlotComposition', () => {
  it('accepte une séance en classe entière sur une case libre', () => {
    expect(checkSlotComposition([], { groupId: null })).toEqual({ ok: true });
  });

  it('refuse une seconde séance en classe entière', () => {
    const occ = [{ entryId: 'e1', groupId: null }];
    expect(checkSlotComposition(occ, { groupId: null })).toEqual({
      ok: false,
      reason: 'WHOLE_CLASS_PRESENT',
    });
  });

  it('accepte deux groupes distincts sur la même case — c’est le dédoublement', () => {
    const occ = [{ entryId: 'e1', groupId: 'g1' }];
    expect(checkSlotComposition(occ, { groupId: 'g2' })).toEqual({ ok: true });
  });

  it('refuse deux fois le même groupe', () => {
    const occ = [{ entryId: 'e1', groupId: 'g1' }];
    expect(checkSlotComposition(occ, { groupId: 'g1' })).toEqual({
      ok: false,
      reason: 'GROUP_ALREADY_PLACED',
    });
  });

  it('refuse un groupe quand la classe entière occupe déjà la case', () => {
    // Les élèves du groupe seraient attendus à deux endroits.
    const occ = [{ entryId: 'e1', groupId: null }];
    expect(checkSlotComposition(occ, { groupId: 'g1' })).toEqual({
      ok: false,
      reason: 'WHOLE_CLASS_PRESENT',
    });
  });

  it('refuse la classe entière quand des groupes occupent la case', () => {
    const occ = [{ entryId: 'e1', groupId: 'g1' }];
    expect(checkSlotComposition(occ, { groupId: null })).toEqual({
      ok: false,
      reason: 'GROUPS_PRESENT',
    });
  });

  it('ne fait pas se bloquer une séance contre elle-même', () => {
    const occ = [{ entryId: 'e1', groupId: 'g1' }];
    expect(checkSlotComposition(occ, { groupId: 'g1' }, 'e1')).toEqual({ ok: true });
  });
});

describe('findTeacherClash', () => {
  const slot = [
    { entryId: 'e1', teacherId: 't1', className: '2AC-A' },
    { entryId: 'e2', teacherId: 't2', className: '2AC-B' },
  ];

  it('détecte un prof déjà placé sur ce créneau, même dans une autre classe', () => {
    expect(findTeacherClash(slot, { teacherId: 't1' })).toEqual({ className: '2AC-A' });
  });

  it('laisse passer un prof libre', () => {
    expect(findTeacherClash(slot, { teacherId: 't3' })).toBeNull();
  });

  it('ne dit rien sans enseignant — une case peut être saisie sans prof', () => {
    expect(findTeacherClash(slot, { teacherId: null })).toBeNull();
  });

  it('exclut la séance en cours de modification', () => {
    expect(findTeacherClash(slot, { teacherId: 't1' }, 'e1')).toBeNull();
  });
});

describe('splitIntoGroups', () => {
  it('répartit en deux groupes équilibrés', () => {
    expect(splitIntoGroups(['a', 'b', 'c', 'd'], 2)).toEqual([
      ['a', 'c'],
      ['b', 'd'],
    ]);
  });

  it('laisse au plus un élève d’écart sur un effectif impair', () => {
    const parts = splitIntoGroups(['a', 'b', 'c', 'd', 'e'], 2);
    expect(parts.map((p) => p.length)).toEqual([3, 2]);
  });

  it('gère trois groupes', () => {
    const parts = splitIntoGroups(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 3);
    expect(parts.map((p) => p.length)).toEqual([3, 2, 2]);
  });

  it('rend des groupes vides si l’effectif est plus petit que le nombre demandé', () => {
    expect(splitIntoGroups(['a'], 3)).toEqual([['a'], [], []]);
  });

  it('couvre tout l’effectif, sans perte ni doublon', () => {
    const ids = Array.from({ length: 26 }, (_, i) => `s${i}`);
    const flat = splitIntoGroups(ids, 4).flat();
    expect(flat).toHaveLength(26);
    expect(new Set(flat).size).toBe(26);
  });
});
