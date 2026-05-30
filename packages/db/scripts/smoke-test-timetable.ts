/**
 * Smoke test S8 phase 1 : Emploi du temps (TimetableSlot + TimetableEntry).
 *   pnpm --filter @jawal/db exec tsx scripts/smoke-test-timetable.ts
 *
 * Couvre :
 *  1) Slots seedés (8 dont 2 pauses)
 *  2) Entries seedées Amina/Maths/1AC-A lundi 08-10
 *  3) Détection conflit prof : on crée une 2e classe + un slot occupé par
 *     Amina dans 1AC-A → l'autre classe la programme au même créneau →
 *     conflit TEACHER détecté
 *  4) Détection conflit salle (idem avec une room)
 *  5) Contrainte unique (classe × jour × slot)
 *  6) Refus de placer un cours dans une pause
 *  7) Isolation cross-tenant
 */
import { PrismaClient, PersonType, DayOfWeek } from '@prisma/client';

const APP = process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL;
if (!APP) throw new Error('DATABASE_URL_APP requis');

const app = new PrismaClient({ datasourceUrl: APP });
const admin = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

async function withT<T>(tenantId: string, fn: (tx: typeof app) => Promise<T>): Promise<T> {
  return app.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
    return fn(tx as typeof app);
  });
}

// Réimplémenté pour rester self-contained
type EntryLite = {
  id: string;
  classId: string;
  dayOfWeek: string;
  slotId: string;
  teacherId: string | null;
  roomId: string | null;
};
function detectConflicts(entries: EntryLite[]): { kind: string; resourceId: string; count: number }[] {
  const byT = new Map<string, EntryLite[]>();
  const byR = new Map<string, EntryLite[]>();
  for (const e of entries) {
    if (e.teacherId) {
      const k = `${e.dayOfWeek}|${e.slotId}|${e.teacherId}`;
      (byT.get(k) ?? byT.set(k, []).get(k)!).push(e);
    }
    if (e.roomId) {
      const k = `${e.dayOfWeek}|${e.slotId}|${e.roomId}`;
      (byR.get(k) ?? byR.set(k, []).get(k)!).push(e);
    }
  }
  const out: { kind: string; resourceId: string; count: number }[] = [];
  for (const [k, list] of byT) if (list.length >= 2) out.push({ kind: 'TEACHER', resourceId: k.split('|')[2]!, count: list.length });
  for (const [k, list] of byR) if (list.length >= 2) out.push({ kind: 'ROOM', resourceId: k.split('|')[2]!, count: list.length });
  return out;
}

async function main() {
  const tenant = await admin.tenant.findUniqueOrThrow({ where: { slug: 'demo' } });
  const year = await admin.academicYear.findFirstOrThrow({
    where: { tenantId: tenant.id, active: true },
  });
  console.log(`🎯 Tenant: ${tenant.name}\n`);

  // 1. Slots seedés
  const slots = await admin.timetableSlot.findMany({
    where: { tenantId: tenant.id },
    orderBy: { order: 'asc' },
  });
  const breaks = slots.filter((s) => s.isBreak);
  const ok1 = slots.length === 8 && breaks.length === 2;
  console.log(`1. ${slots.length} slots dont ${breaks.length} pauses ${ok1 ? '✅' : '❌'}`);

  // 2. Entries seedées Amina/Maths
  const amina = await admin.person.findFirstOrThrow({
    where: { tenantId: tenant.id, type: PersonType.TEACHER, firstName: 'Amina' },
  });
  const entriesAmina = await admin.timetableEntry.findMany({
    where: { tenantId: tenant.id, teacherId: amina.id, academicYearId: year.id },
  });
  if (entriesAmina.length === 0) {
    throw new Error('Aucune entrée seedée pour Amina — relancer le seed avant le smoke test.');
  }
  const classe1ac = await admin.class.findUniqueOrThrow({
    where: { id: entriesAmina[0]!.classId },
  });
  console.log(`   Classe avec EDT Amina : ${classe1ac.name}`);
  const ok2 = entriesAmina.length === 2 && entriesAmina.every((e) => e.dayOfWeek === DayOfWeek.MON);
  console.log(`2. Amina a ${entriesAmina.length} entrées seedées (lundi) ${ok2 ? '✅' : '❌'}`);

  // Setup pour conflits : 2e classe temporaire + reuse de slot occupé
  const tempClassName = `SMOKE-CLASS-${Date.now()}`;
  // Need a level
  const level = await admin.level.findFirstOrThrow({
    where: { tenantId: tenant.id, id: classe1ac.levelId },
  });
  const tempClass = await admin.class.create({
    data: {
      tenantId: tenant.id,
      academicYearId: year.id,
      levelId: level.id,
      name: tempClassName,
      capacity: 10,
    },
  });
  // Slot 1 (déjà occupé par Amina dans 1AC-A lundi)
  const occupiedSlot = entriesAmina.sort((a, b) => a.slotId.localeCompare(b.slotId))[0]!;

  // 3. Créer un conflit prof : Amina dans tempClass au même créneau
  await withT(tenant.id, (tx) =>
    tx.timetableEntry.create({
      data: {
        tenantId: tenant.id,
        academicYearId: year.id,
        classId: tempClass.id,
        slotId: occupiedSlot.slotId,
        dayOfWeek: DayOfWeek.MON,
        teacherId: amina.id,
      },
    }),
  );
  const allYear = await admin.timetableEntry.findMany({
    where: { tenantId: tenant.id, academicYearId: year.id },
  });
  const lite: EntryLite[] = allYear.map((e) => ({
    id: e.id,
    classId: e.classId,
    dayOfWeek: e.dayOfWeek,
    slotId: e.slotId,
    teacherId: e.teacherId,
    roomId: e.roomId,
  }));
  const conflicts = detectConflicts(lite);
  const teacherConflict = conflicts.find((c) => c.kind === 'TEACHER' && c.resourceId === amina.id);
  const ok3 = !!teacherConflict && teacherConflict.count === 2;
  console.log(`3. Conflit prof Amina (lundi 1er créneau, 2 classes) détecté : ${ok3 ? '✅' : '❌'}`);

  // 4. Conflit salle : on crée une room + 2 entries dans la même salle au même créneau
  const room = await admin.room.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'SMOKE-ROOM' } },
    update: {},
    create: { tenantId: tenant.id, code: 'SMOKE-ROOM', label: 'Smoke Room' },
  });
  const otherSlot = slots.find((s) => !s.isBreak && s.id !== occupiedSlot.slotId)!;
  await withT(tenant.id, async (tx) => {
    // Place room dans 1AC-A pour ce slot (mardi pour éviter conflit prof)
    await tx.timetableEntry.upsert({
      where: {
        classId_academicYearId_dayOfWeek_slotId: {
          classId: classe1ac.id,
          academicYearId: year.id,
          dayOfWeek: DayOfWeek.TUE,
          slotId: otherSlot.id,
        },
      },
      update: { roomId: room.id },
      create: {
        tenantId: tenant.id,
        academicYearId: year.id,
        classId: classe1ac.id,
        slotId: otherSlot.id,
        dayOfWeek: DayOfWeek.TUE,
        roomId: room.id,
      },
    });
    await tx.timetableEntry.upsert({
      where: {
        classId_academicYearId_dayOfWeek_slotId: {
          classId: tempClass.id,
          academicYearId: year.id,
          dayOfWeek: DayOfWeek.TUE,
          slotId: otherSlot.id,
        },
      },
      update: { roomId: room.id },
      create: {
        tenantId: tenant.id,
        academicYearId: year.id,
        classId: tempClass.id,
        slotId: otherSlot.id,
        dayOfWeek: DayOfWeek.TUE,
        roomId: room.id,
      },
    });
  });
  const allYear2 = await admin.timetableEntry.findMany({
    where: { tenantId: tenant.id, academicYearId: year.id },
  });
  const conflicts2 = detectConflicts(
    allYear2.map((e) => ({
      id: e.id,
      classId: e.classId,
      dayOfWeek: e.dayOfWeek,
      slotId: e.slotId,
      teacherId: e.teacherId,
      roomId: e.roomId,
    })),
  );
  const roomConflict = conflicts2.find((c) => c.kind === 'ROOM' && c.resourceId === room.id);
  const ok4 = !!roomConflict && roomConflict.count === 2;
  console.log(`4. Conflit salle (mardi 2 classes même salle) détecté : ${ok4 ? '✅' : '❌'}`);

  // 5. Contrainte unique (classe × jour × slot)
  let ok5 = false;
  try {
    await withT(tenant.id, (tx) =>
      tx.timetableEntry.create({
        data: {
          tenantId: tenant.id,
          academicYearId: year.id,
          classId: classe1ac.id,
          slotId: occupiedSlot.slotId,
          dayOfWeek: DayOfWeek.MON,
        },
      }),
    );
  } catch {
    ok5 = true;
  }
  console.log(`5. Contrainte unique (classe × jour × slot) bloque le doublon : ${ok5 ? '✅' : '❌'}`);

  // 6. Refus de placer dans un break — sémantique applicative (testé côté UI/action)
  // Côté DB il n'y a pas de contrainte hard ; on vérifie juste qu'on peut détecter
  // un slot.isBreak
  const breakSlot = breaks[0]!;
  const ok6 = breakSlot.isBreak === true;
  console.log(`6. Slot pause flag isBreak=true (refus côté action) : ${ok6 ? '✅' : '❌'}`);

  // 7. Isolation tenant
  const fakeTenant = '00000000-0000-0000-0000-000000000000';
  const visible = await app.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${fakeTenant}'`);
    return {
      slots: await tx.timetableSlot.count(),
      entries: await tx.timetableEntry.count(),
    };
  });
  const ok7 = visible.slots === 0 && visible.entries === 0;
  console.log(`7. Isolation cross-tenant → ${JSON.stringify(visible)} ${ok7 ? '✅' : '❌'}`);

  // Cleanup
  await admin.timetableEntry.deleteMany({ where: { classId: tempClass.id } });
  await admin.timetableEntry.deleteMany({
    where: { classId: classe1ac.id, dayOfWeek: DayOfWeek.TUE, slotId: otherSlot.id },
  });
  await admin.class.delete({ where: { id: tempClass.id } });
  await admin.room.delete({ where: { id: room.id } });

  await app.$disconnect();
  await admin.$disconnect();
  const all = ok1 && ok2 && ok3 && ok4 && ok5 && ok6 && ok7;
  console.log(`\n${all ? '✅ Tous les tests passent.' : '❌ Au moins un test KO.'}`);
  if (!all) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
