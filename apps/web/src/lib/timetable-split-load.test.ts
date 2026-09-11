import { describe, expect, it } from 'vitest';
import { parseSplitId, splitAssignment, type SplitInput } from './timetable-split-load';

const base: SplitInput = {
  assignmentId: 'a1',
  teacherId: 't1',
  subjectId: 'fr',
  subjectLabel: 'Français',
  classId: 'c1',
  className: 'TCS-A',
  weeklyHours: 3,
  groups: [],
  splitHours: null,
};

const withGroups = (over: Partial<SplitInput> = {}): SplitInput => ({
  ...base,
  groups: [
    { id: 'g1', teacherId: null },
    { id: 'g2', teacherId: 't2' },
  ],
  ...over,
});

describe('splitAssignment', () => {
  it('laisse une matière sans groupe en une seule ligne', () => {
    const out = splitAssignment(base);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'a1', weekly_hours: 3 });
    expect(out[0]!.parallel_key).toBeUndefined();
  });

  it('ne dédouble pas avec un seul groupe', () => {
    const out = splitAssignment({ ...base, groups: [{ id: 'g1', teacherId: null }] });
    expect(out).toHaveLength(1);
    expect(out[0]!.group_id).toBeUndefined();
  });

  it('éclate un dédoublement partiel en classe entière + un groupe chacun', () => {
    // 3 h dont 1 h dédoublée : 2 h en classe entière, puis 1 h × 2 groupes.
    const out = splitAssignment(withGroups({ splitHours: 1 }));
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ weekly_hours: 2, group_id: null });
    expect(out[1]).toMatchObject({ weekly_hours: 1, group_id: 'g1' });
    expect(out[2]).toMatchObject({ weekly_hours: 1, group_id: 'g2' });
  });

  it('donne le même parallel_key aux moitiés — c’est ce qui les synchronise', () => {
    const out = splitAssignment(withGroups({ splitHours: 1 }));
    const keys = out.filter((o) => o.group_id).map((o) => o.parallel_key);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBeTruthy();
  });

  it('n’émet pas de ligne « classe entière » sur un dédoublement total', () => {
    const out = splitAssignment(withGroups({ splitHours: null }));
    expect(out).toHaveLength(2);
    expect(out.every((o) => o.group_id)).toBe(true);
    expect(out.every((o) => o.weekly_hours === 3)).toBe(true);
  });

  it('plafonne une part dédoublée supérieure au volume', () => {
    const out = splitAssignment(withGroups({ splitHours: 9 }));
    expect(out).toHaveLength(2);
    expect(out.every((o) => o.weekly_hours === 3)).toBe(true);
  });

  it('retombe sur la classe entière si la part dédoublée est nulle', () => {
    const out = splitAssignment(withGroups({ splitHours: 0 }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ weekly_hours: 3, group_id: null });
  });

  it('utilise l’enseignant du groupe quand il en a un', () => {
    const out = splitAssignment(withGroups({ splitHours: 1 }));
    expect(out.find((o) => o.group_id === 'g1')!.teacher_id).toBe('t1');
    expect(out.find((o) => o.group_id === 'g2')!.teacher_id).toBe('t2');
  });

  it('rend une ligne à zéro heure sans volume — le solveur n’en placera rien', () => {
    const out = splitAssignment(withGroups({ weeklyHours: 0, splitHours: 1 }));
    expect(out).toHaveLength(1);
    expect(out[0]!.weekly_hours).toBe(0);
  });

  it('gère trois groupes', () => {
    const out = splitAssignment(
      withGroups({
        splitHours: 1,
        groups: [
          { id: 'g1', teacherId: null },
          { id: 'g2', teacherId: null },
          { id: 'g3', teacherId: null },
        ],
      }),
    );
    expect(out.filter((o) => o.group_id)).toHaveLength(3);
  });
});

describe('parseSplitId', () => {
  it('rend l’identifiant tel quel pour une séance de classe entière', () => {
    expect(parseSplitId('a1')).toEqual({ assignmentId: 'a1', groupId: null });
  });

  it('sépare l’affectation et le groupe', () => {
    expect(parseSplitId('a1::g2')).toEqual({ assignmentId: 'a1', groupId: 'g2' });
  });

  it('fait l’aller-retour avec splitAssignment', () => {
    const out = splitAssignment(withGroups({ splitHours: 1 }));
    const g = out.find((o) => o.group_id === 'g2')!;
    expect(parseSplitId(g.id)).toEqual({ assignmentId: 'a1', groupId: 'g2' });
  });

  it('supporte un identifiant contenant un tiret ou un uuid', () => {
    expect(parseSplitId('11111111-2222-3333::44444444-5555')).toEqual({
      assignmentId: '11111111-2222-3333',
      groupId: '44444444-5555',
    });
  });
});
