/**
 * Comparaison OR-Tools vs FET sur le dataset BIG.
 *   pnpm --filter @jawal/db exec tsx scripts/test-solver-big-fet.ts
 */
import { PrismaClient } from '@prisma/client';

const SOLVER_URL = process.env.SOLVER_URL ?? 'http://localhost:8001';
const admin = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

async function buildPayload() {
  const tenant = await admin.tenant.findUniqueOrThrow({ where: { slug: 'demo' } });
  const year = await admin.academicYear.findFirstOrThrow({
    where: { tenantId: tenant.id, label: 'BIG-2025-2026' },
  });
  const classes = await admin.class.findMany({
    where: { tenantId: tenant.id, academicYearId: year.id },
    orderBy: { name: 'asc' },
  });
  const slots = await admin.timetableSlot.findMany({
    where: { tenantId: tenant.id },
    orderBy: { order: 'asc' },
  });
  const assignments = await admin.teacherAssignment.findMany({
    where: { tenantId: tenant.id, academicYearId: year.id },
    include: {
      subject: { select: { id: true, label: true } },
      teacher: { select: { id: true, firstName: true, lastName: true, availability: true } },
      class: { select: { name: true } },
    },
  });
  const rooms = await admin.room.findMany({
    where: { tenantId: tenant.id, code: { startsWith: 'BIG-' } },
  });
  const teacherMap = new Map<string, unknown>();
  for (const a of assignments) {
    if (teacherMap.has(a.teacherId)) continue;
    teacherMap.set(a.teacherId, {
      id: a.teacherId,
      name: `${a.teacher.lastName} ${a.teacher.firstName}`,
      availability: a.teacher.availability ?? {},
    });
  }
  return {
    class_ids: classes.map((c) => c.id),
    slots: slots.map((s) => ({
      id: s.id,
      start_time: s.startTime,
      end_time: s.endTime,
      is_break: s.isBreak,
    })),
    days: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'],
    teachers: [...teacherMap.values()],
    rooms: rooms.map((r) => ({ id: r.id, label: `${r.code} — ${r.label}` })),
    assignments: assignments.map((a) => ({
      id: a.id,
      teacher_id: a.teacherId,
      subject_id: a.subjectId,
      subject_label: a.subject.label,
      class_id: a.classId,
      class_name: a.class.name,
      weekly_hours: a.hoursPerWeek ?? 0,
    })),
    constraints: {
      no_gaps_weight: 50,
      max_hours_per_day_teacher: 6,
    },
  };
}

async function runEngine(engine: 'ortools' | 'fet', basePayload: object) {
  const payload = { ...basePayload, engine, max_solve_seconds: engine === 'fet' ? 180 : 60 };
  const t0 = Date.now();
  const res = await fetch(`${SOLVER_URL}/solve-multi`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const t1 = Date.now();
  const data = await res.json();
  return { engine, httpMs: t1 - t0, ...data };
}

function analyzeGaps(placed: any[], slotsOrder: Map<string, number>) {
  // Pour chaque (classe, jour), détecter les patterns "cours · vide · cours"
  const byClassDay = new Map<string, number[]>();
  for (const p of placed) {
    const k = `${p.class_id}|${p.day}`;
    const arr = byClassDay.get(k) ?? [];
    arr.push(slotsOrder.get(p.slot_id) ?? -1);
    byClassDay.set(k, arr);
  }
  let totalGaps = 0;
  for (const [_, positions] of byClassDay) {
    if (positions.length < 2) continue;
    positions.sort((a, b) => a - b);
    for (let i = 1; i < positions.length; i++) {
      const diff = positions[i]! - positions[i - 1]!;
      if (diff > 1) totalGaps += diff - 1;
    }
  }
  return totalGaps;
}

async function main() {
  const payload = await buildPayload();
  const slots = (payload.slots as any[]).filter((s: any) => !s.is_break);
  const slotsOrder = new Map(slots.map((s: any, i: number) => [s.id, i]));
  const totalHours = (payload.assignments as any[]).reduce((s, a) => s + a.weekly_hours, 0);

  console.log(`📊 Dataset BIG : 9 classes, ${payload.assignments.length} affectations, ${totalHours}h total\n`);

  for (const engine of ['ortools', 'fet'] as const) {
    console.log(`🚀 Test moteur ${engine.toUpperCase()}…`);
    const r = await runEngine(engine, payload);
    const gaps = analyzeGaps(r.placed ?? [], slotsOrder);
    console.log(`   Status      : ${r.status}`);
    console.log(`   Placées     : ${r.placed?.length ?? 0}/${totalHours}`);
    console.log(`   Non placées : ${r.unplaced?.length ?? 0}`);
    console.log(`   Heures creuses : ${gaps}`);
    console.log(`   Temps solveur : ${r.solver_time_ms}ms (HTTP ${r.httpMs}ms)`);
    if (engine === 'ortools' && r.consecutive_blocks)
      console.log(`   Blocs 2h : ${r.consecutive_blocks}`);
    console.log();
  }

  await admin.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
