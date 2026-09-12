import { describe, it, expect } from 'vitest';
import {
  consolidate,
  weighted,
  pct,
  classFillCounts,
  roomOccupancy,
  transportPunctuality,
  type SiteInput,
} from './group-dashboard';

const site = (o: Partial<SiteInput> = {}): SiteInput => ({
  name: 'Campus A',
  students: 100,
  teachers: 10,
  classes: 4,
  byCycle: [{ cycle: 'Collège', students: 100 }],
  due: 1000,
  paid: 900,
  unpaidFamilies: 3,
  teachingHours: 180,
  teacherKeys: [],
  capacity: 120,
  enrolled: 100,
  underfilledClasses: 0,
  overfilledClasses: 0,
  attendanceRate: 95,
  attendanceBase: 100,
  successRate: 80,
  averageGeneral: 12,
  previousAverage: 11,
  ratedStudents: 100,
  ...o,
});

describe('pct / weighted', () => {
  it('arrondit au dixième', () => {
    expect(pct(1, 3)).toBe(33.3);
  });

  it('ne divise pas par zéro', () => {
    expect(pct(5, 0)).toBeNull();
    expect(weighted([])).toBeNull();
  });

  it('pondère par l’effectif, pas par le nombre de sites', () => {
    // 90 % sur 900 élèves et 50 % sur 100 : la moyenne est 86 %, pas 70 %.
    expect(
      weighted([
        { value: 90, weight: 900 },
        { value: 50, weight: 100 },
      ]),
    ).toBe(86);
  });

  it('ignore les sites sans valeur', () => {
    expect(
      weighted([
        { value: null, weight: 500 },
        { value: 80, weight: 100 },
      ]),
    ).toBe(80);
  });
});

describe('consolidate', () => {
  it('additionne les effectifs et les montants', () => {
    const t = consolidate([site(), site({ name: 'B', students: 50, due: 500, paid: 250 })]);
    expect(t.students).toBe(150);
    expect(t.due).toBe(1500);
    expect(t.paid).toBe(1150);
    expect(t.remaining).toBe(350);
  });

  it('recalcule le taux d’encaissement depuis les totaux', () => {
    // Pas la moyenne de 90 % et 50 %, mais 1150 / 1500.
    const t = consolidate([site(), site({ name: 'B', students: 50, due: 500, paid: 250 })]);
    expect(t.collectionRate).toBe(76.7);
    expect(t.unpaidRate).toBe(23.3);
  });

  it('fusionne les effectifs par cycle et les trie par taille', () => {
    const t = consolidate([
      site({
        byCycle: [
          { cycle: 'Primaire', students: 40 },
          { cycle: 'Collège', students: 60 },
        ],
      }),
      site({ name: 'B', byCycle: [{ cycle: 'Collège', students: 30 }] }),
    ]);
    expect(t.byCycle).toEqual([
      { cycle: 'Collège', students: 90 },
      { cycle: 'Primaire', students: 40 },
    ]);
  });

  it('calcule la charge moyenne par professeur', () => {
    const t = consolidate([site({ teachingHours: 180, teachers: 10 })]);
    expect(t.hoursPerTeacher).toBe(18);
  });

  it('repère un enseignant présent sur deux sites', () => {
    const t = consolidate([
      site({ teacherKeys: ['M1', 'M2'] }),
      site({ name: 'B', teacherKeys: ['M2', 'M3'] }),
    ]);
    expect(t.multiSiteTeachers).toBe(1);
  });

  it('ne rapproche pas les fiches sans identifiant', () => {
    const t = consolidate([
      site({ teacherKeys: ['', ''] }),
      site({ name: 'B', teacherKeys: ['', ''] }),
    ]);
    expect(t.multiSiteTeachers).toBe(0);
  });

  it('calcule l’occupation sur les capacités cumulées', () => {
    const t = consolidate([
      site({ capacity: 120, enrolled: 100 }),
      site({ name: 'B', capacity: 80, enrolled: 80 }),
    ]);
    expect(t.occupancyRate).toBe(90);
  });

  it('pondère présence, réussite et moyenne par les élèves concernés', () => {
    const t = consolidate([
      site({ attendanceRate: 90, attendanceBase: 900, successRate: 90, averageGeneral: 14, ratedStudents: 900 }),
      site({ name: 'B', attendanceRate: 50, attendanceBase: 100, successRate: 50, averageGeneral: 10, ratedStudents: 100 }),
    ]);
    expect(t.attendanceRate).toBe(86);
    expect(t.successRate).toBe(86);
    expect(t.averageGeneral).toBe(13.6);
  });

  it('mesure la progression contre la période précédente', () => {
    const t = consolidate([site({ averageGeneral: 12.4, previousAverage: 11.2 })]);
    expect(t.progression).toBe(1.2);
  });

  it('ne prétend pas mesurer une progression sans période précédente', () => {
    const t = consolidate([site({ previousAverage: null })]);
    expect(t.progression).toBeNull();
  });
});

describe('classFillCounts', () => {
  it('sépare sous-remplies et sur-chargées', () => {
    const r = classFillCounts([
      { capacity: 30, enrolled: 10 }, // 33 % → sous-remplie
      { capacity: 30, enrolled: 31 }, // 103 % → sur-chargée
      { capacity: 30, enrolled: 25 }, // 83 % → dans la zone
    ]);
    expect(r).toEqual({ underfilled: 1, overfilled: 1 });
  });

  it('ignore une classe sans capacité saisie', () => {
    // Capacité à 0 = paramétrage manquant, pas une classe vide.
    expect(classFillCounts([{ capacity: 0, enrolled: 25 }])).toEqual({
      underfilled: 0,
      overfilled: 0,
    });
  });

  it('ne compte pas une classe pleine comme sur-chargée', () => {
    expect(classFillCounts([{ capacity: 30, enrolled: 30 }])).toEqual({
      underfilled: 0,
      overfilled: 0,
    });
  });
});

describe('roomOccupancy', () => {
  it('rapporte les créneaux occupés au potentiel', () => {
    const r = roomOccupancy([{ type: 'INFO', rooms: 2, usedCells: 21, capacityCells: 84 }]);
    expect(r[0]).toMatchObject({ type: 'INFO', rate: 25, rooms: 2 });
  });

  it('ne parle pas d’occupation quand le parc est vide', () => {
    const r = roomOccupancy([{ type: 'EPS', rooms: 0, usedCells: 0, capacityCells: 0 }]);
    expect(r[0]!.rate).toBeNull();
  });
});

describe('transportPunctuality', () => {
  it('compte les passages assurés sur les passages pointés', () => {
    expect(transportPunctuality({ PRESENT: 90, LATE: 5, ABSENT: 5 })).toBe(90);
  });

  it('traite non-récupéré et incident comme des défauts', () => {
    expect(transportPunctuality({ PRESENT: 8, NOT_PICKED_UP: 1, INCIDENT: 1 })).toBe(80);
  });

  it('rend null sans aucun pointage', () => {
    expect(transportPunctuality({})).toBeNull();
  });
});
