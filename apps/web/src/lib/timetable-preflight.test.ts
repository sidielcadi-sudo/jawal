import { describe, it, expect } from 'vitest';
import {
  runPreflight,
  usableCells,
  teacherOpenCells,
  blockingMessage,
  warningMessage,
  describeIssue,
  type TeacherLike,
} from './timetable-preflight';

const slots = [
  { id: 's1', start_time: '08:00', end_time: '09:00' },
  { id: 's2', start_time: '09:00', end_time: '10:00' },
  { id: 's3', start_time: '10:00', end_time: '11:00', is_break: true },
  { id: 's4', start_time: '11:00', end_time: '12:00' },
];
const days = ['MON', 'TUE'];
const allDay = { from: '08:00', to: '18:00' };
const avail = { MON: [allDay], TUE: [allDay] };

const teacher = (
  id: string,
  name: string,
  availability: TeacherLike['availability'] = avail,
): TeacherLike => ({ id, name, availability });
const assign = (o: Partial<Parameters<typeof runPreflight>[0]['assignments'][number]> = {}) => ({
  id: 'a1',
  teacher_id: 't1',
  subject_label: 'Français',
  class_id: 'c1',
  class_name: 'TCS-A',
  weekly_hours: 2,
  ...o,
});

const base = (o: Partial<Parameters<typeof runPreflight>[0]> = {}) => ({
  slots,
  days,
  teachers: [teacher('t1', 'Prof 1'), teacher('t2', 'Prof 2')],
  assignments: [assign()],
  ...o,
});

describe('usableCells', () => {
  it('écarte les pauses', () => {
    expect(usableCells(base())).toBe(6); // 2 jours × 3 créneaux enseignables
  });

  it('retire les cases interdites', () => {
    expect(
      usableCells(base({ forbiddenClassSlots: [{ day: 'MON', slot_id: 's1' }] })),
    ).toBe(5);
  });

  it('ne retire pas deux fois la même case', () => {
    expect(
      usableCells(
        base({
          forbiddenClassSlots: [
            { day: 'MON', slot_id: 's1' },
            { day: 'MON', slot_id: 's1' },
          ],
        }),
      ),
    ).toBe(5);
  });
});

describe('teacherOpenCells', () => {
  it('ne compte que les créneaux entièrement couverts', () => {
    // Libre de 8 h à 9 h : seul le premier créneau tient dedans.
    const t = teacher('t1', 'Prof', { MON: [{ from: '08:00', to: '09:00' }] });
    expect(teacherOpenCells(t, slots, days)).toBe(1);
  });

  it('ignore les pauses', () => {
    expect(teacherOpenCells(teacher('t1', 'Prof'), slots, days)).toBe(6);
  });

  it('rend zéro sans disponibilité', () => {
    expect(teacherOpenCells(teacher('t1', 'Prof', {}), slots, days)).toBe(0);
  });
});

describe('runPreflight', () => {
  it('ne signale rien sur des données saines', () => {
    expect(runPreflight(base())).toEqual([]);
  });

  it('bloque quand les deux groupes partagent un enseignant', () => {
    const issues = runPreflight(
      base({
        assignments: [
          assign({ id: 'a::g1', group_id: 'g1', parallel_key: 'split:a', weekly_hours: 1 }),
          assign({ id: 'a::g2', group_id: 'g2', parallel_key: 'split:a', weekly_hours: 1 }),
        ],
      }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ kind: 'SPLIT_SHARED_TEACHER', blocking: false, className: 'TCS-A' });
    expect(describeIssue(issues[0]!)).toContain('même enseignant');
  });

  it('laisse passer un dédoublement à deux enseignants', () => {
    const issues = runPreflight(
      base({
        assignments: [
          assign({ id: 'a::g1', group_id: 'g1', parallel_key: 'split:a', weekly_hours: 1 }),
          assign({ id: 'a::g2', group_id: 'g2', parallel_key: 'split:a', weekly_hours: 1, teacher_id: 't2' }),
        ],
      }),
    );
    expect(issues).toEqual([]);
  });

  it("bloque un professeur sans aucune disponibilité", () => {
    const issues = runPreflight(
      base({ teachers: [teacher('t1', 'Prof 1', {}), teacher('t2', 'Prof 2')] }),
    );
    expect(issues[0]).toMatchObject({ kind: 'TEACHER_NO_AVAILABILITY', teacherName: 'Prof 1' });
  });

  it('bloque un professeur en surcharge', () => {
    const issues = runPreflight(
      base({
        teachers: [teacher('t1', 'Prof 1', { MON: [{ from: '08:00', to: '09:00' }] })],
        assignments: [assign({ weekly_hours: 4 })],
      }),
    );
    const t = issues.find((i) => i.kind === 'TEACHER_OVERLOADED');
    expect(t).toMatchObject({ need: 4, have: 1 });
    expect(describeIssue(t!)).toContain('4 h à placer');
  });

  it('bloque une classe qui déborde de la grille', () => {
    const issues = runPreflight(base({ assignments: [assign({ weekly_hours: 9 })] }));
    expect(issues.some((i) => i.kind === 'CLASS_OVERLOADED' && i.need === 9 && i.have === 6)).toBe(true);
  });

  it('compte la charge d’un demi-groupe à part de celle de sa classe', () => {
    // 5 h en classe entière + 5 h par groupe : aucune cohorte ne dépasse 6.
    const issues = runPreflight(
      base({
        assignments: [
          assign({ weekly_hours: 5 }),
          assign({ id: 'b::g1', group_id: 'g1', parallel_key: 'p', weekly_hours: 5, subject_label: 'Physique' }),
          assign({ id: 'b::g2', group_id: 'g2', parallel_key: 'p', weekly_hours: 5, subject_label: 'Physique', teacher_id: 't2' }),
        ],
      }),
    );
    expect(issues.some((i) => i.kind === 'CLASS_OVERLOADED')).toBe(false);
  });

  it('avertit sans bloquer quand « une séance par jour » est impossible', () => {
    const issues = runPreflight(
      base({ assignments: [assign({ weekly_hours: 3 })], maxSameSubjectPerDay: 1 }),
    );
    const w = issues.find((i) => i.kind === 'SUBJECT_TOO_FREQUENT');
    expect(w).toMatchObject({ blocking: false, need: 3, have: 2 });
  });

  it('ne parle pas de fréquence quand la règle n’est pas active', () => {
    const issues = runPreflight(
      base({ assignments: [assign({ weekly_hours: 3 })], maxSameSubjectPerDay: null }),
    );
    expect(issues.some((i) => i.kind === 'SUBJECT_TOO_FREQUENT')).toBe(false);
  });

  it('signale qu’il n’y a rien à placer', () => {
    const issues = runPreflight(base({ assignments: [assign({ weekly_hours: 0 })] }));
    expect(issues).toEqual([{ kind: 'NOTHING_TO_PLACE', blocking: true }]);
  });

  it('met les causes bloquantes en tête', () => {
    const issues = runPreflight(
      base({
        assignments: [
          assign({ weekly_hours: 3 }),
          assign({ id: 'a::g1', group_id: 'g1', parallel_key: 'p', weekly_hours: 1 }),
          assign({ id: 'a::g2', group_id: 'g2', parallel_key: 'p', weekly_hours: 1 }),
        ],
        maxSameSubjectPerDay: 1,
      }),
    );
    // Deux avertissements ici : dédoublement à prof unique et fréquence.
    expect(issues.every((i) => !i.blocking)).toBe(true);
  });
});

describe('messages', () => {
  it('ne bloque pas quand tout va bien', () => {
    expect(blockingMessage([])).toBeNull();
    expect(warningMessage([])).toBeNull();
  });

  it('énumère les causes bloquantes', () => {
    const issues = runPreflight(
      base({
        teachers: [teacher('t1', 'Prof 1', {})],
        assignments: [assign({ weekly_hours: 9 })],
      }),
    );
    const msg = blockingMessage(issues)!;
    expect(msg).toContain('2 points à corriger');
    expect(msg).toContain('Prof 1');
    expect(msg).toContain('TCS-A');
  });

  it('sépare avertissements et blocages', () => {
    const issues = runPreflight(
      base({ assignments: [assign({ weekly_hours: 3 })], maxSameSubjectPerDay: 1 }),
    );
    expect(blockingMessage(issues)).toBeNull();
    expect(warningMessage(issues)).toContain('À surveiller');
  });
});
