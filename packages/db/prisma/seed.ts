import { PrismaClient, TenantProfile, TenantStatus, PersonType, Gender, PeriodKind } from '@prisma/client';
import bcrypt from 'bcryptjs';

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

const DEMO_ADMIN_EMAIL = 'admin@demo.jawal.ma';
const DEMO_ADMIN_PASSWORD = 'demo1234';
const SUPER_ADMIN_EMAIL = 'super@jawal.ma';
const SUPER_ADMIN_PASSWORD = 'super1234';

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
  const rolesByCode = new Map<string, string>();
  for (const r of SYSTEM_ROLES) {
    const role = await prisma.role.upsert({
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
    rolesByCode.set(r.code, role.id);
  }
  console.log(`  ✓ ${SYSTEM_ROLES.length} rôles système`);

  // 4. Utilisateur admin de démo (tenant_admin)
  const adminPasswordHash = await bcrypt.hash(DEMO_ADMIN_PASSWORD, 10);
  const adminUser = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: DEMO_ADMIN_EMAIL } },
    update: { passwordHash: adminPasswordHash },
    create: {
      tenantId: tenant.id,
      email: DEMO_ADMIN_EMAIL,
      passwordHash: adminPasswordHash,
      emailVerified: new Date(),
      locale: 'fr',
    },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: adminUser.id, roleId: rolesByCode.get('tenant_admin')! } },
    update: {},
    create: {
      tenantId: tenant.id,
      userId: adminUser.id,
      roleId: rolesByCode.get('tenant_admin')!,
    },
  });
  console.log(`  ✓ Admin tenant: ${DEMO_ADMIN_EMAIL} / ${DEMO_ADMIN_PASSWORD}`);

  // 5. Super-admin SaaS (rattaché au tenant demo mais isSuperAdmin=true)
  const superPasswordHash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 10);
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: SUPER_ADMIN_EMAIL } },
    update: { passwordHash: superPasswordHash, isSuperAdmin: true },
    create: {
      tenantId: tenant.id,
      email: SUPER_ADMIN_EMAIL,
      passwordHash: superPasswordHash,
      emailVerified: new Date(),
      isSuperAdmin: true,
      locale: 'fr',
    },
  });
  console.log(`  ✓ Super-admin SaaS: ${SUPER_ADMIN_EMAIL} / ${SUPER_ADMIN_PASSWORD}`);

  // 6. Année scolaire active
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

  const existingPeriods = await prisma.period.count({
    where: { tenantId: tenant.id, academicYearId: year.id },
  });
  if (existingPeriods === 0) {
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
      });
    }
  }
  console.log(`  ✓ Année ${year.label} + 3 trimestres`);

  // 7. Cycles + niveaux
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
    { cycleId: cyclePrim.id, code: '1ap', label: '1ère année primaire', order: 1 },
    { cycleId: cyclePrim.id, code: '2ap', label: '2ème année primaire', order: 2 },
    { cycleId: cyclePrim.id, code: '6ap', label: '6ème année primaire', order: 6 },
    { cycleId: cycleCollege.id, code: '1ac', label: '1ère année collège', order: 1 },
    { cycleId: cycleCollege.id, code: '3ac', label: '3ème année collège', order: 3 },
  ];
  for (const l of levels) {
    await prisma.level.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: l.code } },
      update: {},
      create: { tenantId: tenant.id, ...l },
    });
  }
  console.log(`  ✓ 2 cycles + ${levels.length} niveaux`);

  // 8. Classe + enseignant principal + élèves (idempotent : on saute si déjà présent)
  const existingTeacher = await prisma.person.findFirst({
    where: { tenantId: tenant.id, type: PersonType.TEACHER },
  });
  if (!existingTeacher) {
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
    const level1ac = await prisma.level.findUniqueOrThrow({
      where: { tenantId_code: { tenantId: tenant.id, code: '1ac' } },
    });
    const classe = await prisma.class.create({
      data: {
        tenantId: tenant.id,
        academicYearId: year.id,
        levelId: level1ac.id,
        name: '1AC-A',
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
    console.log(`  ✓ 1 enseignant, 1 classe (1AC-A), ${students.length} élèves`);
  } else {
    console.log(`  ✓ Données pédagogiques déjà présentes (skip)`);
  }

  console.log('\n✅ Seed terminé.\n');
  console.log('────────────── Comptes de démonstration ──────────────');
  console.log(`  Admin établissement   : ${DEMO_ADMIN_EMAIL}`);
  console.log(`  Mot de passe          : ${DEMO_ADMIN_PASSWORD}`);
  console.log(`  Slug établissement    : demo`);
  console.log('');
  console.log(`  Super-admin SaaS      : ${SUPER_ADMIN_EMAIL}`);
  console.log(`  Mot de passe          : ${SUPER_ADMIN_PASSWORD}`);
  console.log(`  (laisser slug vide au login)`);
  console.log('───────────────────────────────────────────────────────\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
