/**
 * Smoke test S8.4 phase B : solver multi-classes + salles + consécutivité.
 *   pnpm --filter @jawal/db exec tsx scripts/smoke-test-solver-multi.ts
 */

const SOLVER_URL = process.env.SOLVER_URL ?? 'http://localhost:8001';

type Resp = {
  status: 'OPTIMAL' | 'FEASIBLE' | 'PARTIAL' | 'INFEASIBLE' | 'ERROR';
  solver_time_ms: number;
  placed: Array<{
    assignment_id: string;
    class_id: string;
    teacher_id: string;
    room_id: string | null;
    day: string;
    slot_id: string;
  }>;
  unplaced: Array<{ assignment_id: string; placed_hours: number; requested_hours: number }>;
  message: string;
  consecutive_blocks: number;
};

async function callMulti(body: unknown): Promise<Resp> {
  const res = await fetch(`${SOLVER_URL}/solve-multi`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
  return (await res.json()) as Resp;
}

async function main() {
  // 1. Cas de base : 2 classes, 1 prof partagé, 2 salles
  const r1 = await callMulti({
    class_ids: ['c1', 'c2'],
    slots: [
      { id: 's1', start_time: '08:00', end_time: '09:00', is_break: false },
      { id: 's2', start_time: '09:00', end_time: '10:00', is_break: false },
      { id: 's3', start_time: '10:00', end_time: '11:00', is_break: false },
    ],
    days: ['MON', 'TUE'],
    teachers: [
      {
        id: 't1',
        name: 'Amina',
        availability: {
          MON: [{ from: '08:00', to: '11:00' }],
          TUE: [{ from: '08:00', to: '11:00' }],
        },
      },
    ],
    rooms: [
      { id: 'r1', label: 'A101' },
      { id: 'r2', label: 'A102' },
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
      {
        id: 'a2',
        teacher_id: 't1',
        subject_id: 'math',
        subject_label: 'Maths',
        class_id: 'c2',
        class_name: '6B',
        weekly_hours: 3,
      },
    ],
    consecutive_bonus: 1,
  });
  const allPlaced1 = r1.placed.length === 6 && r1.unplaced.length === 0;
  const allHaveRoom = r1.placed.every((p) => p.room_id !== null);
  console.log(
    `1. 6 heures placées + salles affectées (2 classes, 1 prof) : placed=${r1.placed.length} rooms=${allHaveRoom ? 'oui' : 'non'} blocks=${r1.consecutive_blocks} ${allPlaced1 && allHaveRoom ? '✅' : '❌'}`,
  );

  // 2. Anti-conflit prof : Amina dans 2 classes au même slot doit être bloquée
  const teacherSlotMap = new Map<string, string>();
  let conflictDetected = false;
  for (const p of r1.placed) {
    if (p.teacher_id === 't1') {
      const key = `${p.day}|${p.slot_id}`;
      if (teacherSlotMap.has(key)) {
        conflictDetected = true;
        break;
      }
      teacherSlotMap.set(key, p.assignment_id);
    }
  }
  console.log(`2. Aucun conflit prof Amina : ${!conflictDetected ? '✅' : '❌'}`);

  // 3. Anti-conflit salle : pas 2 cours dans même room au même slot
  const roomSlotMap = new Map<string, string>();
  let roomConflict = false;
  for (const p of r1.placed) {
    if (!p.room_id) continue;
    const key = `${p.day}|${p.slot_id}|${p.room_id}`;
    if (roomSlotMap.has(key)) {
      roomConflict = true;
      break;
    }
    roomSlotMap.set(key, p.assignment_id);
  }
  console.log(`3. Aucun conflit salle : ${!roomConflict ? '✅' : '❌'}`);

  // 4. Consécutivité : avec bonus=10, on doit voir des blocs 2h
  const r4 = await callMulti({
    class_ids: ['c1'],
    slots: [
      { id: 's1', start_time: '08:00', end_time: '09:00', is_break: false },
      { id: 's2', start_time: '09:00', end_time: '10:00', is_break: false },
      { id: 's3', start_time: '10:00', end_time: '11:00', is_break: false },
      { id: 's4', start_time: '14:00', end_time: '15:00', is_break: false },
    ],
    days: ['MON', 'TUE'],
    teachers: [
      {
        id: 't1',
        name: 'X',
        availability: {
          MON: [{ from: '08:00', to: '15:00' }],
          TUE: [{ from: '08:00', to: '15:00' }],
        },
      },
    ],
    rooms: [],
    assignments: [
      {
        id: 'a1',
        teacher_id: 't1',
        subject_id: 'math',
        subject_label: 'Maths',
        class_id: 'c1',
        class_name: '6A',
        weekly_hours: 4,
      },
    ],
    consecutive_bonus: 10, // Forte préférence
  });
  // 4 heures, slots adjacents max : (s1,s2), (s2,s3) → max 3 paires si on place 4 consécutifs
  // On attend au moins 1 bloc consécutif
  console.log(
    `4. Bonus consécutivité (bonus=10) : ${r4.consecutive_blocks} blocs créés ${r4.consecutive_blocks >= 1 ? '✅' : '❌'}`,
  );

  // 5. Multi-classes avec dispo prof unique : impossible de tout placer
  const r5 = await callMulti({
    class_ids: ['c1', 'c2', 'c3'],
    slots: [
      { id: 's1', start_time: '08:00', end_time: '09:00', is_break: false },
    ],
    days: ['MON'],
    teachers: [
      { id: 't1', name: 'X', availability: { MON: [{ from: '08:00', to: '09:00' }] } },
    ],
    rooms: [],
    assignments: [
      { id: 'a1', teacher_id: 't1', subject_id: 'm', subject_label: 'M', class_id: 'c1', class_name: '6A', weekly_hours: 1 },
      { id: 'a2', teacher_id: 't1', subject_id: 'm', subject_label: 'M', class_id: 'c2', class_name: '6B', weekly_hours: 1 },
      { id: 'a3', teacher_id: 't1', subject_id: 'm', subject_label: 'M', class_id: 'c3', class_name: '6C', weekly_hours: 1 },
    ],
    consecutive_bonus: 0,
  });
  // 1 seul créneau dispo, 3 demandes → 1 placé, 2 non placés (le prof ne peut pas être dans 3 classes en même temps)
  const ok5 = r5.placed.length === 1 && r5.unplaced.length === 2 && r5.status === 'PARTIAL';
  console.log(
    `5. Anti-double-booking : placed=${r5.placed.length} unplaced=${r5.unplaced.length} status=${r5.status} ${ok5 ? '✅' : '❌'}`,
  );

  const all = allPlaced1 && allHaveRoom && !conflictDetected && !roomConflict && r4.consecutive_blocks >= 1 && ok5;
  console.log(`\n${all ? '✅ Tous les tests passent.' : '❌ Au moins un test KO.'}`);
  if (!all) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
