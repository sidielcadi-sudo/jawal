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

describe('séances déclarées', () => {
  const base = {
    assignmentId: 'a1',
    teacherId: 't1',
    subjectId: 's1',
    subjectLabel: 'Français',
    classId: 'c1',
    className: 'TCS-A',
    weeklyHours: 3,
    groups: [
      { id: 'g1', teacherId: 't1' },
      { id: 'g2', teacherId: 't2' },
    ],
  };

  it('déduit le volume dédoublé des séances déclarées', () => {
    const out = splitAssignment({
      ...base,
      splitHours: null, // aurait dédoublé les 3 h
      fixedSlots: [{ day: 'MON', slotId: 'sl1', groupId: null }],
    });
    expect(out).toHaveLength(3);
    expect(out[0]!.weekly_hours).toBe(2); // classe entière
    expect(out[1]!.weekly_hours).toBe(1);
    expect(out[2]!.weekly_hours).toBe(1);
  });

  it('impose le créneau aux deux groupes', () => {
    const out = splitAssignment({
      ...base,
      splitHours: null,
      fixedSlots: [{ day: 'MON', slotId: 'sl1', groupId: null }],
    });
    const groups = out.filter((o) => o.group_id);
    expect(groups).toHaveLength(2);
    for (const g of groups) {
      expect(g.fixed_slots).toEqual([{ day: 'MON', slot_id: 'sl1' }]);
    }
  });

  it('la déclaration prime sur le nombre d’heures saisi', () => {
    const out = splitAssignment({
      ...base,
      splitHours: 3,
      fixedSlots: [{ day: 'TUE', slotId: 'sl2', groupId: null }],
    });
    expect(out.filter((o) => o.group_id)[0]!.weekly_hours).toBe(1);
  });

  it('plafonne au volume de la matière', () => {
    const out = splitAssignment({
      ...base,
      weeklyHours: 2,
      splitHours: null,
      fixedSlots: [
        { day: 'MON', slotId: 'sl1', groupId: null },
        { day: 'TUE', slotId: 'sl2', groupId: null },
        { day: 'WED', slotId: 'sl3', groupId: null },
      ],
    });
    const g = out.filter((o) => o.group_id);
    expect(g[0]!.weekly_hours).toBe(2);
    expect(g[0]!.fixed_slots).toHaveLength(2);
  });

  it('sans déclaration, rien n’est imposé', () => {
    const out = splitAssignment({ ...base, splitHours: 1 });
    expect(out.filter((o) => o.group_id)[0]!.fixed_slots).toBeUndefined();
  });
});

describe('séances successives', () => {
  const base = {
    assignmentId: 'a1',
    teacherId: 't1',
    subjectId: 's1',
    subjectLabel: 'Physique',
    classId: 'c1',
    className: 'TCS-A',
    weeklyHours: 3,
    splitHours: null,
    groups: [
      { id: 'g1', teacherId: null },
      { id: 'g2', teacherId: null },
    ],
  };

  it('donne à chaque groupe son propre créneau', () => {
    const out = splitAssignment({
      ...base,
      fixedSlots: [
        { day: 'MON', slotId: 'sl1', groupId: 'g1' },
        { day: 'MON', slotId: 'sl2', groupId: 'g2' },
      ],
    });
    const g1 = out.find((o) => o.group_id === 'g1')!;
    const g2 = out.find((o) => o.group_id === 'g2')!;
    expect(g1.fixed_slots).toEqual([{ day: 'MON', slot_id: 'sl1' }]);
    expect(g2.fixed_slots).toEqual([{ day: 'MON', slot_id: 'sl2' }]);
  });

  it('n’impose PAS la simultanéité', () => {
    // C'est ce qui autorise le même professeur sur les deux moitiés.
    const out = splitAssignment({
      ...base,
      fixedSlots: [
        { day: 'MON', slotId: 'sl1', groupId: 'g1' },
        { day: 'MON', slotId: 'sl2', groupId: 'g2' },
      ],
    });
    for (const o of out.filter((x) => x.group_id)) {
      expect(o.parallel_key).toBeUndefined();
    }
  });

  it('ne retranche qu’une fois les heures de groupe au volume de classe', () => {
    // 3 h dont 1 h par groupe : l'élève a 2 h en classe entière, pas 1 h.
    const out = splitAssignment({
      ...base,
      fixedSlots: [
        { day: 'MON', slotId: 'sl1', groupId: 'g1' },
        { day: 'MON', slotId: 'sl2', groupId: 'g2' },
      ],
    });
    expect(out.find((o) => !o.group_id)!.weekly_hours).toBe(2);
    expect(out.filter((o) => o.group_id).every((o) => o.weekly_hours === 1)).toBe(true);
  });

  it('garde des identifiants distincts des lignes simultanées', () => {
    const out = splitAssignment({
      ...base,
      fixedSlots: [
        { day: 'MON', slotId: 'sl1', groupId: null },
        { day: 'TUE', slotId: 'sl1', groupId: 'g1' },
        { day: 'TUE', slotId: 'sl2', groupId: 'g2' },
      ],
    });
    const ids = out.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('a1::g1');
    expect(ids).toContain('a1::g1::seq');
  });

  it('accepte les deux modes sur la même matière', () => {
    // 1 h simultanée + 1 h par groupe = 2 h vues par l'élève, 1 h en entier.
    const out = splitAssignment({
      ...base,
      fixedSlots: [
        { day: 'MON', slotId: 'sl1', groupId: null },
        { day: 'TUE', slotId: 'sl1', groupId: 'g1' },
        { day: 'TUE', slotId: 'sl2', groupId: 'g2' },
      ],
    });
    expect(out.find((o) => !o.group_id)!.weekly_hours).toBe(1);
    expect(out.filter((o) => o.parallel_key)).toHaveLength(2);
    expect(out.filter((o) => o.group_id && !o.parallel_key)).toHaveLength(2);
  });

  it('ignore une séance rattachée à un groupe disparu', () => {
    const out = splitAssignment({
      ...base,
      fixedSlots: [{ day: 'MON', slotId: 'sl1', groupId: 'groupe-supprimé' }],
    });
    // Rien en groupes : tout le volume reste en classe entière.
    expect(out).toHaveLength(1);
    expect(out[0]!.weekly_hours).toBe(3);
  });

  it('tolère un déséquilibre entre groupes', () => {
    // G1 a deux séances, G2 une seule : l'élève le plus servi en voit deux,
    // c'est ce maximum qu'on retranche au volume de classe entière.
    const out = splitAssignment({
      ...base,
      fixedSlots: [
        { day: 'MON', slotId: 'sl1', groupId: 'g1' },
        { day: 'TUE', slotId: 'sl1', groupId: 'g1' },
        { day: 'MON', slotId: 'sl2', groupId: 'g2' },
      ],
    });
    expect(out.find((o) => !o.group_id)!.weekly_hours).toBe(1);
    expect(out.find((o) => o.group_id === 'g1')!.weekly_hours).toBe(2);
    expect(out.find((o) => o.group_id === 'g2')!.weekly_hours).toBe(1);
  });
});

describe('parseSplitId', () => {
  it('retrouve le groupe malgré le suffixe des séances successives', () => {
    expect(parseSplitId('a1::g1::seq')).toEqual({ assignmentId: 'a1', groupId: 'g1' });
  });

  it('lit une ligne simultanée', () => {
    expect(parseSplitId('a1::g1')).toEqual({ assignmentId: 'a1', groupId: 'g1' });
  });

  it('lit une ligne de classe entière', () => {
    expect(parseSplitId('a1')).toEqual({ assignmentId: 'a1', groupId: null });
  });
});
