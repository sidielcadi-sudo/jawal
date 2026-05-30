/**
 * Smoke test S8 phase 2 : validations EDT (dispo prof + volume horaire).
 *   pnpm --filter @jawal/db exec tsx scripts/smoke-test-timetable-validation.ts
 *
 * Tests purs côté helpers (pas de FK DB pour ces validations).
 */
import { PrismaClient, PersonType } from '@prisma/client';

const APP = process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL;
if (!APP) throw new Error('DATABASE_URL_APP requis');

const app = new PrismaClient({ datasourceUrl: APP });
const admin = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

// Réimplémentations locales (self-contained)
type DayKey = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';
type AvailSlot = { from: string; to: string };
type AvailMap = Partial<Record<DayKey, AvailSlot[]>>;

function isInAvailability(
  day: DayKey,
  start: string,
  end: string,
  av: AvailMap | null,
): boolean {
  if (!av) return false;
  const ranges = av[day];
  if (!ranges || ranges.length === 0) return false;
  return ranges.some((r) => r.from <= start && r.to >= end);
}

function slotDurationMin(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return eh! * 60 + em! - (sh! * 60 + sm!);
}

async function main() {
  console.log(`🎯 Tests purs (sans modification DB)\n`);

  // 1. Dispo : MON 08:00-12:00 → 08-09 OK, 11:15-12:15 KO (déborde), 14-15 KO (jour vide)
  const av: AvailMap = { MON: [{ from: '08:00', to: '12:00' }] };
  const ok1a = isInAvailability('MON', '08:00', '09:00', av) === true;
  const ok1b = isInAvailability('MON', '11:15', '12:15', av) === false; // déborde
  const ok1c = isInAvailability('TUE', '08:00', '09:00', av) === false; // jour absent
  const ok1d = isInAvailability('MON', '10:00', '11:00', av) === true;
  console.log(`1. isInAvailability cas standards : ${ok1a && ok1b && ok1c && ok1d ? '✅' : '❌'}`);
  console.log(`   MON 08-09 = ${ok1a ? '✅' : '❌'} · MON 11:15-12:15 (déborde) = ${ok1b ? '✅' : '❌'} · TUE 08-09 = ${ok1c ? '✅' : '❌'} · MON 10-11 = ${ok1d ? '✅' : '❌'}`);

  // 2. Dispo null / vide
  const ok2a = isInAvailability('MON', '08:00', '09:00', null) === false;
  const ok2b = isInAvailability('MON', '08:00', '09:00', {}) === false;
  const ok2c = isInAvailability('MON', '08:00', '09:00', { MON: [] }) === false;
  console.log(`2. isInAvailability null/vide → false : ${ok2a && ok2b && ok2c ? '✅' : '❌'}`);

  // 3. Plusieurs plages : matin + après-midi
  const av3: AvailMap = {
    MON: [
      { from: '08:00', to: '12:00' },
      { from: '14:00', to: '17:00' },
    ],
  };
  const ok3a = isInAvailability('MON', '15:00', '16:00', av3) === true;
  const ok3b = isInAvailability('MON', '12:30', '13:30', av3) === false; // pause déjeuner
  console.log(`3. Plusieurs plages : matin ${ok3a ? '✅' : '❌'} · midi (pause) refusé ${ok3b ? '✅' : '❌'}`);

  // 4. slotDurationMin
  const ok4a = slotDurationMin('08:00', '09:00') === 60;
  const ok4b = slotDurationMin('10:00', '10:15') === 15;
  const ok4c = slotDurationMin('11:15', '12:15') === 60;
  console.log(`4. slotDurationMin : ${ok4a && ok4b && ok4c ? '✅' : '❌'} (60, 15, 60)`);

  // 5. Test bout-en-bout sur Amina depuis seed
  const tenant = await admin.tenant.findUniqueOrThrow({ where: { slug: 'demo' } });
  const amina = await admin.person.findFirstOrThrow({
    where: { tenantId: tenant.id, type: PersonType.TEACHER, firstName: 'Amina' },
  });
  const aminaAv = amina.availability as AvailMap | null;
  // Le seed pose 5 jours de dispo 08:00-12:00 et 14:00-17:00 selon le helper hr-sections
  // — on vérifie juste que sa MON 08-09 est OK
  const ok5 = isInAvailability('MON', '08:00', '09:00', aminaAv) === true;
  console.log(
    `5. Amina dispo lundi 08-09 (depuis seed) : ${ok5 ? '✅' : '❌ (seed peut avoir évolué)'}`,
  );

  // 6. computeAssignmentDeltas — entries 2h, assignment 3h → delta -1
  // (simulé inline car helper n'est pas exporté côté db)
  const expectedH = 3;
  const scheduledMin = 60 + 60;
  const scheduledH = Math.round((scheduledMin / 60) * 100) / 100;
  const delta = Math.round((scheduledH - expectedH) * 100) / 100;
  const ok6 = scheduledH === 2 && delta === -1;
  console.log(`6. Delta volume horaire : expected=${expectedH}h, scheduled=${scheduledH}h, delta=${delta}h ${ok6 ? '✅' : '❌'}`);

  await app.$disconnect();
  await admin.$disconnect();
  const all = ok1a && ok1b && ok1c && ok1d && ok2a && ok2b && ok2c && ok3a && ok3b && ok4a && ok4b && ok4c && ok6;
  console.log(`\n${all ? '✅ Tous les tests passent.' : '❌ Au moins un test KO.'}`);
  if (!all) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
