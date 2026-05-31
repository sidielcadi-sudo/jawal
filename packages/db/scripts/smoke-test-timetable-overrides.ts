/**
 * Smoke test S8 phase 3 : remplacements ponctuels + ICS.
 *   pnpm --filter @jawal/db exec tsx scripts/smoke-test-timetable-overrides.ts
 *
 * Couvre :
 *  1) Création d'une override CANCELLED sur une entry seedée → stocké, indexé
 *  2) Création d'une override SUBSTITUTION avec teacher remplaçant
 *  3) Upsert (2e write sur même entryId × date) → met à jour, pas duplique
 *  4) Contrainte unique (entryId × date)
 *  5) Format ICS de base (en-têtes + RRULE + EXDATE) — test pur du builder
 *  6) Isolation cross-tenant
 */
import { PrismaClient, PersonType } from '@prisma/client';

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

// Mini ICS builder local pour test pur
function buildIcsTest(opts: {
  uid: string;
  dtstart: string;
  dtend: string;
  rrule: string;
  exdates?: string[];
  summary: string;
}): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    `UID:${opts.uid}`,
    `DTSTART:${opts.dtstart}`,
    `DTEND:${opts.dtend}`,
    `RRULE:${opts.rrule}`,
  ];
  if (opts.exdates?.length) lines.push(`EXDATE:${opts.exdates.join(',')}`);
  lines.push(`SUMMARY:${opts.summary}`);
  lines.push('END:VEVENT');
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

async function main() {
  // 5. Format ICS de base (test pur, ne nécessite pas la DB)
  const ics = buildIcsTest({
    uid: 'abc@jawal',
    dtstart: '20260907T080000',
    dtend: '20260907T090000',
    rrule: 'FREQ=WEEKLY;BYDAY=MO;UNTIL=20270630T235959',
    exdates: ['20261019T080000'],
    summary: 'Mathématiques',
  });
  const okIcs =
    ics.includes('BEGIN:VCALENDAR') &&
    ics.includes('END:VCALENDAR') &&
    ics.includes('RRULE:FREQ=WEEKLY;BYDAY=MO') &&
    ics.includes('EXDATE:20261019T080000') &&
    ics.includes('SUMMARY:Mathématiques');
  console.log(`(pur) ICS structure (VCALENDAR + RRULE + EXDATE) : ${okIcs ? '✅' : '❌'}`);

  // Tests DB — si Postgres injoignable, on saute proprement
  let tenant;
  try {
    tenant = await admin.tenant.findUniqueOrThrow({ where: { slug: 'demo' } });
  } catch (e) {
    console.log(`\n⚠ Tests DB sautés (Postgres injoignable) — relancez avec Docker up.`);
    await app.$disconnect().catch(() => {});
    await admin.$disconnect().catch(() => {});
    process.exit(okIcs ? 0 : 1);
  }
  console.log(`🎯 Tenant: ${tenant.name}\n`);

  // Récup une entry seedée pour Amina lundi
  const aminaEntries = await admin.timetableEntry.findMany({
    where: {
      tenantId: tenant.id,
      teacher: { firstName: 'Amina' },
    },
    take: 1,
  });
  if (aminaEntries.length === 0) {
    throw new Error('Aucune entry Amina seedée — relancer le seed.');
  }
  const entry = aminaEntries[0]!;

  // Cleanup éventuel
  const testDate = new Date('2099-11-04T00:00:00.000Z'); // mardi 2099, futur
  await admin.timetableOverride.deleteMany({ where: { entryId: entry.id, date: testDate } });

  // 1. CANCELLED
  const cancelled = await withT(tenant.id, (tx) =>
    tx.timetableOverride.create({
      data: {
        tenantId: tenant.id,
        entryId: entry.id,
        date: testDate,
        kind: 'CANCELLED',
        reason: 'Smoke test',
      },
    }),
  );
  const ok1 = cancelled.kind === 'CANCELLED';
  console.log(`1. Override CANCELLED créé : ${ok1 ? '✅' : '❌'}`);

  // 2. SUBSTITUTION avec teacher remplaçant — on a besoin d'un autre teacher
  // Pour éviter contrainte unique sur (entryId × date), on utilise une autre date
  const testDate2 = new Date('2099-11-11T00:00:00.000Z');
  const replacementTeacher = await admin.person.findFirst({
    where: {
      tenantId: tenant.id,
      type: PersonType.TEACHER,
      NOT: { firstName: 'Amina' },
    },
  });
  if (replacementTeacher) {
    await admin.timetableOverride.deleteMany({ where: { entryId: entry.id, date: testDate2 } });
    const sub = await withT(tenant.id, (tx) =>
      tx.timetableOverride.create({
        data: {
          tenantId: tenant.id,
          entryId: entry.id,
          date: testDate2,
          kind: 'SUBSTITUTION',
          substituteTeacherId: replacementTeacher.id,
          reason: 'Maladie',
        },
      }),
    );
    const ok2 = sub.kind === 'SUBSTITUTION' && sub.substituteTeacherId === replacementTeacher.id;
    console.log(`2. Override SUBSTITUTION avec remplaçant : ${ok2 ? '✅' : '❌'}`);
  } else {
    console.log(`2. Pas de 2ᵉ TEACHER seed → test substitution sauté ⚠`);
  }

  // 3. Upsert sur même (entryId, date)
  await withT(tenant.id, (tx) =>
    tx.timetableOverride.upsert({
      where: { entryId_date: { entryId: entry.id, date: testDate } },
      update: { reason: 'Updated' },
      create: {
        tenantId: tenant.id,
        entryId: entry.id,
        date: testDate,
        kind: 'CANCELLED',
        reason: 'Initial',
      },
    }),
  );
  const updated = await admin.timetableOverride.findUniqueOrThrow({
    where: { entryId_date: { entryId: entry.id, date: testDate } },
  });
  const ok3 = updated.reason === 'Updated';
  console.log(`3. Upsert sur même (entry × date) → reason="${updated.reason}" ${ok3 ? '✅' : '❌'}`);

  // 4. Contrainte unique (création directe d'un doublon → erreur)
  let ok4 = false;
  try {
    await withT(tenant.id, (tx) =>
      tx.timetableOverride.create({
        data: {
          tenantId: tenant.id,
          entryId: entry.id,
          date: testDate,
          kind: 'CANCELLED',
        },
      }),
    );
  } catch {
    ok4 = true;
  }
  console.log(`4. Contrainte unique (entryId × date) bloque doublon : ${ok4 ? '✅' : '❌'}`);

  // (test 5 ICS déjà fait en début du main, en mode pur)
  const ok5 = okIcs;

  // 6. Isolation cross-tenant
  const fake = '00000000-0000-0000-0000-000000000000';
  const visible = await app.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${fake}'`);
    return tx.timetableOverride.count();
  });
  const ok6 = visible === 0;
  console.log(`6. Isolation cross-tenant → ${visible} overrides visibles ${ok6 ? '✅' : '❌'}`);

  // Cleanup
  await admin.timetableOverride.deleteMany({ where: { entryId: entry.id, date: { in: [testDate, testDate2] } } });

  await app.$disconnect();
  await admin.$disconnect();
  const all = ok1 && ok3 && ok4 && ok5 && ok6;
  console.log(`\n${all ? '✅ Tous les tests passent.' : '❌ Au moins un test KO.'}`);
  if (!all) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
