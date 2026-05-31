/**
 * Smoke test S8.4 phase A : appel HTTP au solver Python OR-Tools.
 *   pnpm --filter @jawal/db exec tsx scripts/smoke-test-solver.ts
 *
 * Couvre :
 *  1) /health répond ok
 *  2) /solve cas simple : 5h Maths à placer, 3 jours × 3 slots → 5 placés
 *  3) /solve infaisable : 100h demandées sur 6 jours × 6 slots → PARTIAL
 *  4) Anti-conflit prof : 2 affectations même prof, jour saturé → bascule
 *  5) Dispo prof respectée : prof dispo lundi uniquement
 */

const SOLVER_URL = process.env.SOLVER_URL ?? 'http://localhost:8001';

type Resp = {
  status: 'OPTIMAL' | 'FEASIBLE' | 'PARTIAL' | 'INFEASIBLE' | 'ERROR';
  solver_time_ms: number;
  placed: Array<{ assignment_id: string; day: string; slot_id: string }>;
  unplaced: Array<{ assignment_id: string; placed_hours: number; requested_hours: number }>;
  message: string;
};

async function callSolver(body: unknown): Promise<Resp> {
  const res = await fetch(`${SOLVER_URL}/solve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as Resp;
}

async function main() {
  // 1. Health
  const health = await fetch(`${SOLVER_URL}/health`);
  const ok1 = health.ok && (await health.json()).status === 'ok';
  console.log(`1. /health : ${ok1 ? '✅' : '❌'}`);

  // 2. Cas simple — 5h Maths à placer
  const r2 = await callSolver({
    class_id: 'c1',
    slots: [
      { id: 's1', start_time: '08:00', end_time: '09:00', is_break: false },
      { id: 's2', start_time: '09:00', end_time: '10:00', is_break: false },
      { id: 's3', start_time: '10:00', end_time: '10:15', is_break: true },
      { id: 's4', start_time: '10:15', end_time: '11:15', is_break: false },
    ],
    days: ['MON', 'TUE', 'WED'],
    teachers: [
      {
        id: 't1',
        name: 'Amina',
        availability: {
          MON: [{ from: '08:00', to: '12:00' }],
          TUE: [{ from: '08:00', to: '12:00' }],
          WED: [{ from: '08:00', to: '12:00' }],
        },
      },
    ],
    assignments: [
      {
        id: 'a1',
        teacher_id: 't1',
        subject_id: 'math',
        subject_label: 'Maths',
        class_id: 'c1',
        class_name: '6A',
        weekly_hours: 5,
      },
    ],
    busy_teacher_slots: [],
  });
  const ok2 = r2.status === 'OPTIMAL' && r2.placed.length === 5 && r2.unplaced.length === 0;
  console.log(
    `2. 5h Maths placées : ${r2.placed.length}/5 status=${r2.status} ${ok2 ? '✅' : '❌'}`,
  );

  // 3. Demande de 30h alors qu'il n'y a que 4 créneaux × 3 jours = 12 max
  const r3 = await callSolver({
    class_id: 'c1',
    slots: [
      { id: 's1', start_time: '08:00', end_time: '09:00', is_break: false },
      { id: 's2', start_time: '09:00', end_time: '10:00', is_break: false },
    ],
    days: ['MON', 'TUE'],
    teachers: [
      {
        id: 't1',
        name: 'X',
        availability: {
          MON: [{ from: '08:00', to: '18:00' }],
          TUE: [{ from: '08:00', to: '18:00' }],
        },
      },
    ],
    assignments: [
      {
        id: 'a1',
        teacher_id: 't1',
        subject_id: 'math',
        subject_label: 'Maths',
        class_id: 'c1',
        class_name: '6A',
        weekly_hours: 30,
      },
    ],
    busy_teacher_slots: [],
  });
  const ok3 = r3.status === 'PARTIAL' && r3.placed.length === 4 && r3.unplaced[0]?.placed_hours === 4;
  console.log(
    `3. Demande > capacité : placés ${r3.placed.length}/30 status=${r3.status} ${ok3 ? '✅' : '❌'}`,
  );

  // 4. Anti-conflit : 2 affectations même prof, créneau partagé
  const r4 = await callSolver({
    class_id: 'c1',
    slots: [
      { id: 's1', start_time: '08:00', end_time: '09:00', is_break: false },
      { id: 's2', start_time: '09:00', end_time: '10:00', is_break: false },
    ],
    days: ['MON'],
    teachers: [
      { id: 't1', name: 'X', availability: { MON: [{ from: '08:00', to: '10:00' }] } },
    ],
    assignments: [
      {
        id: 'a1',
        teacher_id: 't1',
        subject_id: 'math',
        subject_label: 'Maths',
        class_id: 'c1',
        class_name: '6A',
        weekly_hours: 2,
      },
      {
        id: 'a2',
        teacher_id: 't1',
        subject_id: 'fr',
        subject_label: 'Français',
        class_id: 'c1',
        class_name: '6A',
        weekly_hours: 2,
      },
    ],
    busy_teacher_slots: [],
  });
  // 2 slots disponibles, mais le prof ne peut placer que 2 séances au total (Maths OU Français)
  // car (classe × slot) = 1 cours max. Donc unplaced doit exister.
  const totalPlaced = r4.placed.length;
  const ok4 = totalPlaced === 2 && r4.unplaced.length > 0;
  console.log(
    `4. Anti-conflit : ${totalPlaced} placés / 4 demandés, unplaced=${r4.unplaced.length} ${ok4 ? '✅' : '❌'}`,
  );

  // 5. Dispo prof respectée
  const r5 = await callSolver({
    class_id: 'c1',
    slots: [
      { id: 's1', start_time: '08:00', end_time: '09:00', is_break: false },
      { id: 's2', start_time: '14:00', end_time: '15:00', is_break: false },
    ],
    days: ['MON', 'TUE', 'WED'],
    teachers: [
      {
        id: 't1',
        name: 'Matin',
        // Dispo MATIN UNIQUEMENT et le LUNDI UNIQUEMENT
        availability: { MON: [{ from: '08:00', to: '12:00' }] },
      },
    ],
    assignments: [
      {
        id: 'a1',
        teacher_id: 't1',
        subject_id: 'math',
        subject_label: 'Maths',
        class_id: 'c1',
        class_name: '6A',
        weekly_hours: 3,
      },
    ],
    busy_teacher_slots: [],
  });
  // Seul créneau compatible : MON 08-09 → 1 placé, 2 non placés
  const ok5 =
    r5.placed.length === 1 &&
    r5.placed[0]?.day === 'MON' &&
    r5.placed[0]?.slot_id === 's1' &&
    r5.unplaced.length === 1;
  console.log(
    `5. Dispo MON matin uniquement : 1 placé sur ${r5.placed[0]?.day} ${r5.placed[0]?.slot_id} ${ok5 ? '✅' : '❌'}`,
  );

  const all = ok1 && ok2 && ok3 && ok4 && ok5;
  console.log(`\n${all ? '✅ Tous les tests passent.' : '❌ Au moins un test KO.'}`);
  if (!all) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
