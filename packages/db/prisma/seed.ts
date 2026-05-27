import { PrismaClient, TenantProfile, TenantStatus, PersonType, Gender, PeriodKind } from '@prisma/client';

const prisma = new PrismaClient();

const SYSTEM_ROLES = [
  { code: 'tenant_admin', label: 'Administrateur établissement', permissions: ['*'] },
  { code: 'direction', label: 'Direction', permissions: ['*.read', 'reports.*'] },
  { code: 'scolarite', label: 'Scolarité', permissions: ['students.*', 'classes.*', 'admissions.*'] },
  { code: 'comptable', label: 'Comptabilité', permissions: ['finance.*'] },
  { code: 'enseignant', label: 'Enseignant', permissions: ['attendance.write', 'grades.write', 'lms.write'] },
  { code: 'cpe', label: 'CPE / Vie scolaire', permissions: ['attendance.*', 'discipline.*'] },
  { code: 'parent', label: 'Parent', permissions: ['self.read'] },
  { code: 'eleve', label: 'Élève', permissions: ['self.read'] },
] as const;

const CORE_MODULES = [
  'core',
  'admissions',
  'scolarite',
  'edt',
  'presences',
  'notes',
  'examens',
  'lms',
  'communication',
  'finance',
];

async function main() {
  console.log('🌱 Seed Jawal…');

  // 1. Tenant de démo
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      slug: 'demo',
      name: 'Établissement de démonstration',
      profile: TenantProfile.K12,
      status: TenantStatus.ACTIVE,
      localeDefault: 'fr',
      currency: 'MAD',
      timezone: 'Africa/Casablanca',
    },
  });
  console.log(`  ✓ Tenant: ${tenant.name} (${tenant.id})`);

  // 2. Modules activés
  for (const code of CORE_MODULES) {
    await prisma.tenantModule.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code } },
      update: { enabled: true },
      create: { tenantId: tenant.id, code, enabled: true },
    });
  }
  console.log(`  ✓ ${CORE_MODULES.length} modules activés`);

  // 3. Rôles système
  for (const r of SYSTEM_ROLES) {
    await prisma.role.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: r.code } },
      update: {},
      create: {
        tenantId: tenant.id,
        code: r.code,
        label: r.label,
        permissions: [...r.permissions],
        isSystem: true,
      },
    });
  }
  console.log(`  ✓ ${SYSTEM_ROLES.length} rôles système`);

  // 4. Année scolaire active
  const year = await prisma.academicYear.upsert({
    where: { tenantId_label: { tenantId: tenant.id, label: '2025-2026' } },
    update: { active: true },
    create: {
      tenantId: tenant.id,
      label: '2025-2026',
      startDate: new Date('2025-09-01'),
      endDate: new Date('2026-07-15'),
      active: true,
    },
  });

  // 5. Trois trimestres
  const trimesters = [
    { label: 'Trimestre 1', start: '2025-09-01', end: '2025-12-15' },
    { label: 'Trimestre 2', start: '2026-01-05', end: '2026-03-31' },
    { label: 'Trimestre 3', start: '2026-04-15', end: '2026-07-10' },
  ];
  for (const tri of trimesters) {
    await prisma.period.create({
      data: {
        tenantId: tenant.id,
        academicYearId: year.id,
        kind: PeriodKind.TRIMESTER,
        label: tri.label,
        startDate: new Date(tri.start),
        endDate: new Date(tri.end),
      },
    }).catch(() => null); // idempotent
  }
  console.log(`  ✓ Année ${year.label} + 3 trimestres`);

  // 6. Cycles + niveaux (K-12 basique)
  const cyclePrim = await prisma.cycle.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'primaire' } },
    update: {},
    create: { tenantId: tenant.id, code: 'primaire', label: 'Primaire', order: 1 },
  });
  const cycleCollege = await prisma.cycle.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'college' } },
    update: {},
    create: { tenantId: tenant.id, code: 'college', label: 'Collège', order: 2 },
  });

  const levels = [
    { cycleId: cyclePrim.id, code: 'cp', label: 'CP', order: 1 },
    { cycleId: cyclePrim.id, code: 'ce1', label: 'CE1', order: 2 },
    { cycleId: cyclePrim.id, code: 'cm2', label: 'CM2', order: 5 },
    { cycleId: cycleCollege.id, code: '6eme', label: '6ème', order: 1 },
    { cycleId: cycleCollege.id, code: '3eme', label: '3ème', order: 4 },
  ];
  for (const l of levels) {
    await prisma.level.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: l.code } },
      update: {},
      create: { tenantId: tenant.id, ...l },
    });
  }
  console.log(`  ✓ 2 cycles + ${levels.length} niveaux`);

  // 7. Un enseignant principal + une classe + quelques élèves
  const teacher = await prisma.person.create({
    data: {
      tenantId: tenant.id,
      type: PersonType.TEACHER,
      firstName: 'Amina',
      lastName: 'El Idrissi',
      gender: Gender.F,
      contacts: { email: 'amina.elidrissi@demo.jawal.ma' },
    },
  });

  const level6 = await prisma.level.findUniqueOrThrow({
    where: { tenantId_code: { tenantId: tenant.id, code: '6eme' } },
  });
  const classe = await prisma.class.create({
    data: {
      tenantId: tenant.id,
      academicYearId: year.id,
      levelId: level6.id,
      name: '6ème A',
      capacity: 30,
      mainTeacherId: teacher.id,
    },
  });

  const students = [
    { firstName: 'Yassine', lastName: 'Benani', gender: Gender.M },
    { firstName: 'Salma', lastName: 'Cherkaoui', gender: Gender.F },
    { firstName: 'Omar', lastName: 'Tazi', gender: Gender.M },
  ];
  for (const s of students) {
    const p = await prisma.person.create({
      data: {
        tenantId: tenant.id,
        type: PersonType.STUDENT,
        ...s,
        birthDate: new Date('2013-05-12'),
      },
    });
    await prisma.studentClass.create({
      data: { tenantId: tenant.id, studentId: p.id, classId: classe.id },
    });
  }
  console.log(`  ✓ 1 enseignant, 1 classe (6ème A), ${students.length} élèves`);

  console.log('\n✅ Seed terminé.\n');
  console.log(`Tenant ID: ${tenant.id}`);
  console.log(`Slug: ${tenant.slug} (accessible via http://demo.${process.env.ROOT_DOMAIN ?? 'jawal.local'}:3000)\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
