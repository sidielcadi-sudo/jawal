/**
 * Client HTTP pour le service solver OR-Tools (Python FastAPI).
 *
 * URL configurable via env SOLVER_URL (default http://localhost:8001 en dev).
 */

const SOLVER_URL = process.env.SOLVER_URL ?? 'http://localhost:8001';

export type DayKey = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

export type SolverSlot = {
  id: string;
  start_time: string;
  end_time: string;
  is_break: boolean;
};

export type SolverTeacher = {
  id: string;
  name: string;
  availability: Partial<Record<DayKey, Array<{ from: string; to: string }>>>;
};

export type SolverAssignment = {
  id: string;
  teacher_id: string;
  subject_id: string;
  subject_label: string;
  class_id: string;
  class_name: string;
  weekly_hours: number;
};

export type SolverBusySlot = {
  teacher_id: string;
  day: DayKey;
  slot_id: string;
};

export type SolverRequest = {
  class_id: string;
  slots: SolverSlot[];
  days: DayKey[];
  teachers: SolverTeacher[];
  assignments: SolverAssignment[];
  busy_teacher_slots: SolverBusySlot[];
  max_solve_seconds?: number;
};

export type SolverPlacedEntry = {
  assignment_id: string;
  class_id: string;
  subject_id: string;
  teacher_id: string;
  day: DayKey;
  slot_id: string;
};

export type SolverUnplaced = {
  assignment_id: string;
  subject_label: string;
  teacher_id: string;
  requested_hours: number;
  placed_hours: number;
  reason: string;
};

export type SolverResponse = {
  status: 'OPTIMAL' | 'FEASIBLE' | 'PARTIAL' | 'INFEASIBLE' | 'ERROR';
  solver_time_ms: number;
  placed: SolverPlacedEntry[];
  unplaced: SolverUnplaced[];
  message: string;
};

export async function callSolver(req: SolverRequest): Promise<SolverResponse> {
  const res = await fetch(`${SOLVER_URL}/solve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Solver HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as SolverResponse;
}

// ─── Phase B : multi-classes + salles ────────────────────────────

export type SolverRoom = { id: string; label: string };

export type SolverConstraints = {
  max_same_subject_per_day?: number | null;
  no_gaps_weight?: number | null;
  consecutive_subject_ids?: string[];
  max_hours_per_day_teacher?: number | null;
};

export type SolverMultiRequest = {
  class_ids: string[];
  slots: SolverSlot[];
  days: DayKey[];
  teachers: SolverTeacher[];
  rooms: SolverRoom[];
  assignments: SolverAssignment[];
  max_solve_seconds?: number;
  consecutive_bonus?: number;
  constraints?: SolverConstraints;
};

export type SolverMultiPlaced = SolverPlacedEntry & {
  room_id: string | null;
};

export type SolverMultiResponse = {
  status: SolverResponse['status'];
  solver_time_ms: number;
  placed: SolverMultiPlaced[];
  unplaced: SolverUnplaced[];
  message: string;
  consecutive_blocks: number;
};

export async function callSolverMulti(
  req: SolverMultiRequest,
): Promise<SolverMultiResponse> {
  const res = await fetch(`${SOLVER_URL}/solve-multi`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Solver HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as SolverMultiResponse;
}

export async function solverHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${SOLVER_URL}/health`, { cache: 'no-store' });
    if (!res.ok) return false;
    const data = (await res.json()) as { status?: string };
    return data.status === 'ok';
  } catch {
    return false;
  }
}
