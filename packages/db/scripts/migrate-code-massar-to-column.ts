/**
 * Reprise du code MASSAR : `metadata.codeMassar` (texte libre historique) →
 * colonne dédiée `Person.massarId` (unique par établissement).
 *
 *   pnpm --filter @jawal/db exec tsx scripts/migrate-code-massar-to-column.ts [--apply]
 *
 * Sans `--apply`, le script se contente d'un rapport (aucune écriture).
 *
 * Garde-fous :
 *  - un code présent plusieurs fois dans un même établissement ne peut pas
 *    tenir dans une colonne unique : AUCUNE des fiches concernées n'est
 *    migrée, et `metadata.codeMassar` est conservé pour ne rien perdre. Ces
 *    cas sont listés pour arbitrage manuel ;
 *  - si la colonne est déjà remplie et diverge du metadata, la colonne fait
 *    foi (elle vient de l'import) et le cas est signalé ;
 *  - `metadata.codeMassar` n'est purgé que sur les fiches effectivement
 *    migrées ou déjà cohérentes.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Meta = Record<string, unknown>;

function readCode(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const v = (metadata as Meta).codeMassar;
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

async function main() {
  const apply = process.argv.includes('--apply');

  const persons = await prisma.person.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      tenantId: true,
      type: true,
      firstName: true,
      lastName: true,
      massarId: true,
      metadata: true,
    },
  });

  const candidates = persons
    .map((p) => ({ ...p, code: readCode(p.metadata) }))
    .filter((p): p is typeof p & { code: string } => p.code !== null);

  // Un code ne peut être porté que par une fiche au sein d'un établissement.
  const countByKey = new Map<string, number>();
  for (const p of candidates) {
    const key = `${p.tenantId}|${p.code}`;
    countByKey.set(key, (countByKey.get(key) ?? 0) + 1);
  }

  const toMigrate: typeof candidates = [];
  const alreadyOk: typeof candidates = [];
  const conflicts: typeof candidates = [];
  const divergent: typeof candidates = [];

  for (const p of candidates) {
    if (p.massarId && p.massarId === p.code) {
      alreadyOk.push(p);
    } else if (p.massarId && p.massarId !== p.code) {
      divergent.push(p);
    } else if ((countByKey.get(`${p.tenantId}|${p.code}`) ?? 0) > 1) {
      conflicts.push(p);
    } else {
      toMigrate.push(p);
    }
  }

  const name = (p: { lastName: string; firstName: string }) => `${p.lastName} ${p.firstName}`;

  console.log(`Fiches avec metadata.codeMassar : ${candidates.length}`);
  console.log(`  à migrer vers la colonne      : ${toMigrate.length}`);
  console.log(`  déjà cohérentes               : ${alreadyOk.length}`);
  console.log(`  en conflit (code en double)   : ${conflicts.length}`);
  console.log(`  divergentes (colonne ≠ meta)  : ${divergent.length}`);

  if (conflicts.length > 0) {
    console.log('\n⚠ Codes en double — non migrés, metadata conservé :');
    const byCode = new Map<string, string[]>();
    for (const p of conflicts) {
      const list = byCode.get(p.code) ?? [];
      list.push(name(p));
      byCode.set(p.code, list);
    }
    for (const [code, names] of byCode) {
      console.log(`  « ${code} » → ${names.join(', ')}`);
    }
    console.log('  Corrigez ces codes dans la fiche élève, puis relancez.');
  }

  if (divergent.length > 0) {
    console.log('\n⚠ Colonne déjà remplie et différente — la colonne fait foi :');
    for (const p of divergent) {
      console.log(`  ${name(p)} : colonne « ${p.massarId} » vs metadata « ${p.code} »`);
    }
  }

  if (!apply) {
    console.log('\n(rapport seul — relancer avec --apply pour écrire)');
    return;
  }

  console.log('\n── Écriture ────────────────────────────────────────');
  let migrated = 0;
  for (const p of toMigrate) {
    const meta = { ...(p.metadata as Meta) };
    delete meta.codeMassar;
    await prisma.person.update({
      where: { id: p.id },
      data: { massarId: p.code, metadata: meta },
    });
    migrated++;
  }

  // Fiches déjà cohérentes : on retire simplement la clé redondante.
  let cleaned = 0;
  for (const p of alreadyOk) {
    const meta = { ...(p.metadata as Meta) };
    delete meta.codeMassar;
    await prisma.person.update({ where: { id: p.id }, data: { metadata: meta } });
    cleaned++;
  }

  console.log(`${migrated} fiche(s) migrée(s) · ${cleaned} clé(s) redondante(s) purgée(s)`);
  console.log(
    `${conflicts.length} fiche(s) laissée(s) en l'état (conflit) · ${divergent.length} divergence(s) signalée(s)`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
