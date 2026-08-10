/**
 * Paramétrage initial de GROUPE SCOLAIRE ALMASSIRA 2 pour l'import MASSAR :
 *   - code établissement MASSAR (filtre des lignes à l'import)
 *   - année scolaire 2026-2027 (active — c'est la seule du tenant)
 *   - cycle « Primaire » + ses 6 niveaux (1AP → 6AP)
 *
 * Idempotent : relançable sans créer de doublon. Lancer :
 *   pnpm --filter @jawal/db exec tsx scripts/setup-almassira2-primaire.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TENANT_SLUG = 'al-massira2';
const MASSAR_CODE = 'CASA001';
const YEAR_LABEL = '2026-2027';
const CYCLE_CODE = 'primaire';

/** Niveaux du primaire marocain, dans l'ordre de progression. */
const LEVELS = [
  { code: '1ap', label: '1ère année primaire' },
  { code: '2ap', label: '2ème année primaire' },
  { code: '3ap', label: '3ème année primaire' },
  { code: '4ap', label: '4ème année primaire' },
  { code: '5ap', label: '5ème année primaire' },
  { code: '6ap', label: '6ème année primaire' },
];

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (!tenant) throw new Error(`Tenant « ${TENANT_SLUG} » introuvable.`);
  const tenantId = tenant.id;

  if (tenant.massarCode !== MASSAR_CODE) {
    await prisma.tenant.update({ where: { id: tenantId }, data: { massarCode: MASSAR_CODE } });
    console.log(`✓ code MASSAR = ${MASSAR_CODE}`);
  } else {
    console.log(`· code MASSAR déjà = ${MASSAR_CODE}`);
  }

  // Année scolaire — septembre → juin, active car c'est la seule du tenant.
  let year = await prisma.academicYear.findFirst({ where: { tenantId, label: YEAR_LABEL } });
  if (!year) {
    year = await prisma.academicYear.create({
      data: {
        tenantId,
        label: YEAR_LABEL,
        startDate: new Date('2026-09-01'),
        endDate: new Date('2027-06-30'),
        active: true,
      },
    });
    console.log(`✓ année ${YEAR_LABEL} créée (active)`);
  } else {
    console.log(`· année ${YEAR_LABEL} déjà présente`);
  }

  // Cycle primaire
  let cycle = await prisma.cycle.findFirst({ where: { tenantId, code: CYCLE_CODE } });
  if (!cycle) {
    cycle = await prisma.cycle.create({
      data: { tenantId, code: CYCLE_CODE, label: 'Primaire', order: 1 },
    });
    console.log('✓ cycle Primaire créé');
  } else {
    console.log('· cycle Primaire déjà présent');
  }

  // Niveaux
  let createdLevels = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    const { code, label } = LEVELS[i]!;
    const existing = await prisma.level.findFirst({ where: { tenantId, code } });
    if (existing) continue;
    await prisma.level.create({
      data: { tenantId, cycleId: cycle.id, code, label, order: i + 1 },
    });
    createdLevels++;
  }
  console.log(
    createdLevels > 0 ? `✓ ${createdLevels} niveau(x) créé(s)` : '· niveaux déjà présents',
  );

  const levels = await prisma.level.findMany({
    where: { tenantId },
    orderBy: { order: 'asc' },
    select: { code: true, label: true, order: true },
  });
  console.log('\nNiveaux du tenant :');
  for (const l of levels) console.log(`  ${l.order}. ${l.code} — ${l.label}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
