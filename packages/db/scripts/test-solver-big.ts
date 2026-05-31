/**
 * Test du solveur en charge réelle sur le dataset BIG.
 * Simule l'appel /solve-multi avec les 9 classes BIG-*.
 *
 *   pnpm --filter @jawal/db exec tsx scripts/test-solver-big.ts
 */
import { PrismaClient } from '@prisma/client';

const APP = process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL;
if (!APP) throw new Error('DATABASE_URL_APP requis');

const SOLVER_URL = process.env.SOLVER_URL ?? 'http://localhost:8001';
const admin = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

async function main() {
  const tenant = await admin.tenant.findUniqueOrThrow({ where: { slug: 'demo' } });
  const year = await admin.academicYear.findFirstOrThrow({
    where: { tenantId: tenant.id, label: 'BIG-2025-2026' },
  });

  const classes = await admin.class.findMany({
    where: { tenantId: tenant.id, academicYearId: year.id },
    orderBy: { name: 'asc' },
  });
  console.log(`📚 ${classes.length} classes BIG trouvées : ${classes.map((c) => c.name).join(', ')}`);

  const slots = await admin.timetableSlot.findMany({
    where: { tenantId: tenant.id },
    orderBy: { order: 'asc' },
  });
  console.log(`🕐 ${slots.length} créneaux (dont ${slots.filter((s) => s.isBreak).length} pauses)`);

  const assignments = await admin.teacherAssignment.findMany({
    where: { tenantId: tenant.id, academicYearId: year.id },
    include: {
      subject: { select: { id: true, label: true } },
      teacher: { select: { id: true, firstName: true, lastName: true, availability: true } },
      class: { select: { name: true } },
    },
  });
  console.log(`📋 ${assignments.length} affectations à placer`);

  const totalHours = assignments.reduce((s, a) => s + (a.hoursPerWeek ?? 0), 0);
  console.log(`📊 Volume horaire total : ${totalHours}h/semaine`);

  const teacherMap = new Map<string, unknown>();
  for (const a of assignments) {
    if (teacherMap.has(a.teacherId)) continue;
    teacherMap.set(a.teacherId, {
      id: a.teacherId,
      name: `${a.teacher.lastName} ${a.teacher.firstName}`,
      availability: a.teacher.availability ?? {},
    });
  }
  console.log(`👩‍🏫 ${teacherMap.size} profs distincts`);

  const rooms = await admin.room.findMany({
    where: { tenantId: tenant.id, code: { startsWith: 'BIG-' } },
  });
  console.log(`🚪 ${rooms.length} salles BIG-* disponibles`);

  const payload = {
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
    max_solve_seconds: 60,
    consecutive_bonus: 1,
  };

  console.log(`\n🚀 Appel /solve-multi…`);
  const t0 = Date.now();
  const res = await fetch(`${SOLVER_URL}/solve-multi`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const t1 = Date.now();
  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const data = await res.json();

  console.log(`\n📊 Résultat (HTTP ${t1 - t0}ms, solver ${data.solver_time_ms}ms) :`);
  console.log(`   Status              : ${data.status}`);
  console.log(`   Heures placées      : ${data.placed.length} / ${totalHours}`);
  console.log(`   Affectations OK     : ${assignments.length - data.unplaced.length} / ${assignments.length}`);
  console.log(`   Blocs 2h consécutifs : ${data.consecutive_blocks}`);
  console.log(`   Message             : ${data.message}`);

  if (data.unplaced.length > 0) {
    console.log(`\n⚠ ${data.unplaced.length} affectations partielles ou non placées :`);
    for (const u of data.unplaced.slice(0, 10)) {
      console.log(`   - ${u.subject_label} : ${u.placed_hours}/${u.requested_hours}h — ${u.reason}`);
    }
    if (data.unplaced.length > 10) {
      console.log(`   … et ${data.unplaced.length - 10} autres`);
    }
  }

  // Stats par classe
  const placedByClass = new Map<string, number>();
  for (const p of data.placed) {
    placedByClass.set(p.class_id, (placedByClass.get(p.class_id) ?? 0) + 1);
  }
  console.log(`\n📅 Heures placées par classe :`);
  for (const c of classes) {
    console.log(`   ${c.name}: ${placedByClass.get(c.id) ?? 0}h`);
  }

  // Stats salles utilisées
  const roomsUsed = new Set<string>();
  let placedWithoutRoom = 0;
  for (const p of data.placed) {
    if (p.room_id) roomsUsed.add(p.room_id);
    else placedWithoutRoom += 1;
  }
  console.log(`\n🚪 Salles utilisées : ${roomsUsed.size} / ${rooms.length}`);
  console.log(`   Heures sans salle affectée : ${placedWithoutRoom}`);

  await admin.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
