/**
 * Smoke test de l'import MASSAR — exerce le vrai code métier
 * (`@/lib/massar-import`), écritures comprises, sans passer par l'UI.
 *
 *   pnpm --filter web exec tsx scripts/smoke-test-import-massar.ts <fichier.csv> [slug] [--commit]
 *
 * Sans `--commit`, seule l'analyse est jouée (aucune écriture).
 */
import { readFileSync } from 'node:fs';
import { prismaAdmin } from '@/lib/db';
import { analyzeMassarCsv, runMassarImport } from '@/lib/massar-import';

async function main() {
  const file = process.argv[2];
  const slug =
    process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : 'al-massira2';
  const commit = process.argv.includes('--commit');
  if (!file) throw new Error('Usage : smoke-test-import-massar.ts <fichier.csv> [slug] [--commit]');

  const tenant = await prismaAdmin.tenant.findUnique({ where: { slug } });
  if (!tenant) throw new Error(`Tenant « ${slug} » introuvable.`);

  const year = await prismaAdmin.academicYear.findFirst({
    where: { tenantId: tenant.id, active: true },
    select: { id: true, label: true },
  });
  if (!year) throw new Error('Aucune année active pour ce tenant.');

  const csv = readFileSync(file, 'utf-8');
  console.log(`Tenant : ${tenant.name} — code MASSAR ${tenant.massarCode ?? '(aucun)'}`);
  console.log(`Année  : ${year.label}\n`);

  const res = await analyzeMassarCsv(tenant.id, csv, year.id);
  if (!res.ok) throw new Error(`Analyse en échec : ${res.error}`);

  for (const r of res.preview.rows) {
    const mark = { create: '✓', update: '↻', skipped: '⊘', error: '✕' }[r.status];
    const detail =
      r.status === 'error'
        ? r.error
        : r.status === 'skipped'
          ? `établissement ${r.schoolCode}`
          : `${r.levelLabel} · ${r.className}${r.classExists ? '' : ' (nouvelle)'} · « ${r.nameAr} »`;
    console.log(`  ${mark} L${r.row} ${r.massarId.padEnd(10)} ${r.name.padEnd(22)} ${detail}`);
  }

  const c = res.preview.counts;
  console.log(
    `\nAnalyse : ${c.create} à créer · ${c.update} à mettre à jour · ${c.skipped} ignorée(s) · ${c.error} erreur(s)`,
  );
  console.log(`Classes à créer : ${res.preview.classesToCreate.join(', ') || '(aucune)'}`);

  if (!commit) {
    console.log('\n(analyse seule — relancer avec --commit pour écrire)');
    return;
  }

  console.log('\n── Écriture ────────────────────────────────────────');
  const run = await runMassarImport(tenant.id, null, csv, year.id);
  if (!run.ok) throw new Error(`Import en échec : ${run.error}`);
  const s = run.stats;
  console.log(
    `élèves ${s.students} · inscriptions ${s.enrollments} · classes ${s.classes} · parents ${s.parents}`,
  );

  // Contrôle de cohérence : ce qui est réellement en base après import.
  const where = { tenantId: tenant.id };
  const [students, enrollments, classes, parents, memberships] = await Promise.all([
    prismaAdmin.person.count({ where: { ...where, type: 'STUDENT', deletedAt: null } }),
    prismaAdmin.enrollment.count({ where: { ...where, academicYearId: year.id } }),
    prismaAdmin.class.count({ where: { ...where, academicYearId: year.id, deletedAt: null } }),
    prismaAdmin.person.count({ where: { ...where, type: 'PARENT', deletedAt: null } }),
    prismaAdmin.studentClass.count({ where: { ...where, unenrolledAt: null } }),
  ]);
  console.log(
    `\nEn base : ${students} élève(s) · ${enrollments} inscription(s) · ${classes} classe(s) · ${parents} parent(s) · ${memberships} affectation(s)`,
  );

  const sample = await prismaAdmin.person.findFirst({
    where: { ...where, type: 'STUDENT', massarId: { not: null } },
    select: {
      massarId: true,
      firstName: true,
      lastName: true,
      firstNameAr: true,
      lastNameAr: true,
      gender: true,
      birthDate: true,
      contacts: true,
      address: true,
      enrollments: { select: { status: true, class: { select: { name: true, nameAr: true } } } },
      relationsAsChild: {
        select: { type: true, parent: { select: { firstName: true, lastName: true } } },
      },
    },
  });
  console.log('\nÉchantillon :', JSON.stringify(sample, null, 2));
}

main()
  .then(() => prismaAdmin.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prismaAdmin.$disconnect();
    process.exit(1);
  });
