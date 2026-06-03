import {
  PrismaClient,
  TenantProfile,
  TenantStatus,
  PersonType,
  Gender,
  PeriodKind,
  RelationType,
  ContractType,
  PayrollPaymentMethod,
} from '@prisma/client';
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

const TEACHER_ROLES = [
  { code: 'TEACHER',             labelFr: 'Professeur',                labelAr: 'أستاذ',           order: 10 },
  { code: 'MAIN_TEACHER',        labelFr: 'Professeur principal',      labelAr: 'أستاذ رئيسي',     order: 20 },
  { code: 'SUBJECT_COORDINATOR', labelFr: 'Coordinateur de matière',   labelAr: 'منسق المادة',    order: 30 },
  { code: 'LEVEL_COORDINATOR',   labelFr: 'Coordinateur de niveau',    labelAr: 'منسق المستوى',   order: 40 },
  { code: 'LIBRARIAN_TEACHER',   labelFr: 'Documentaliste pédagogique', labelAr: 'موثق تربوي',    order: 50 },
] as const;

const STAFF_ROLES = [
  { code: 'DIRECTOR',          labelFr: 'Directeur',                       labelAr: 'المدير',                 order: 10 },
  { code: 'DEPUTY_DIRECTOR',   labelFr: 'Directeur adjoint',               labelAr: 'نائب المدير',            order: 20 },
  { code: 'EDUCATION_ADVISOR', labelFr: "Conseiller principal d'éducation", labelAr: 'مستشار التربية الرئيسي', order: 30 },
  { code: 'BURSAR',            labelFr: 'Gestionnaire',                    labelAr: 'المسير المالي',          order: 40 },
  { code: 'SUPERVISOR',        labelFr: 'Surveillant général',             labelAr: 'الحارس العام',           order: 50 },
  { code: 'MONITOR',           labelFr: 'Surveillant',                     labelAr: 'المراقب',                order: 60 },
  { code: 'SECRETARY',         labelFr: 'Secrétaire',                      labelAr: 'كاتب الإدارة',           order: 70 },
  { code: 'ACCOUNTANT',        labelFr: 'Comptable',                       labelAr: 'المحاسب',                order: 80 },
  { code: 'LIBRARIAN',         labelFr: 'Bibliothécaire',                  labelAr: 'أمين المكتبة',           order: 90 },
  { code: 'NURSE',             labelFr: 'Infirmier(ère)',                  labelAr: 'الممرض(ة)',              order: 100 },
  { code: 'IT_OFFICER',        labelFr: 'Responsable informatique',        labelAr: 'مسؤول المعلوميات',       order: 110 },
  { code: 'MAINTENANCE',       labelFr: "Agent d'entretien",               labelAr: 'عامل النظافة',           order: 120 },
  { code: 'SECURITY',          labelFr: 'Agent de sécurité',               labelAr: 'عون الأمن',              order: 130 },
  { code: 'DRIVER',            labelFr: 'Chauffeur',                       labelAr: 'السائق',                 order: 140 },
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
const DEMO_PARENT_EMAIL = 'hassan.benani@demo.jawal.ma';
const DEMO_PARENT_PASSWORD = 'parent1234';

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

  // 7.bis Rôles paramétrables (enseignants + personnel) — bilingues FR/AR
  for (const r of TEACHER_ROLES) {
    await prisma.personRole.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: r.code } },
      update: { labelFr: r.labelFr, labelAr: r.labelAr, order: r.order },
      create: {
        tenantId: tenant.id,
        appliesTo: PersonType.TEACHER,
        code: r.code,
        labelFr: r.labelFr,
        labelAr: r.labelAr,
        order: r.order,
      },
    });
  }
  for (const r of STAFF_ROLES) {
    await prisma.personRole.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: r.code } },
      update: { labelFr: r.labelFr, labelAr: r.labelAr, order: r.order },
      create: {
        tenantId: tenant.id,
        appliesTo: PersonType.STAFF,
        code: r.code,
        labelFr: r.labelFr,
        labelAr: r.labelAr,
        order: r.order,
      },
    });
  }
  console.log(`  ✓ ${TEACHER_ROLES.length + STAFF_ROLES.length} rôles paramétrables (FR/AR)`);

  // 7.ter Attribuer le rôle MAIN_TEACHER à l'enseignant Amina existant (rétro-compat)
  const mainTeacherRoleUpgrade = await prisma.personRole.findUnique({
    where: { tenantId_code: { tenantId: tenant.id, code: 'MAIN_TEACHER' } },
  });
  if (mainTeacherRoleUpgrade) {
    await prisma.person.updateMany({
      where: { tenantId: tenant.id, type: PersonType.TEACHER, roleId: null },
      data: { roleId: mainTeacherRoleUpgrade.id },
    });
  }

  // 7.quaterMatières standard + programme par niveau (idempotent)
  const STD_SUBJECTS = [
    { code: 'math', label: 'Mathématiques', coefficient: 4, order: 10 },
    { code: 'fr', label: 'Français', coefficient: 3, order: 20 },
    { code: 'ar', label: 'Arabe', coefficient: 3, order: 30 },
    { code: 'phys', label: 'Sciences physiques', coefficient: 2, order: 40 },
    { code: 'svt', label: 'SVT', coefficient: 2, order: 50 },
  ] as const;
  for (const s of STD_SUBJECTS) {
    // Évite les conflits si l'utilisateur a renommé code ou label : on skip
    // toute matière qui existe déjà par l'un des deux champs uniques.
    const existing = await prisma.subject.findFirst({
      where: {
        tenantId: tenant.id,
        OR: [{ code: s.code }, { label: s.label }],
      },
    });
    if (existing) continue;
    await prisma.subject.create({ data: { tenantId: tenant.id, ...s } });
  }
  // Programme par niveau (1AC = collège 1ère année — coef/heures alignés sur Maroc K-12)
  const level1ac = await prisma.level.findUnique({
    where: { tenantId_code: { tenantId: tenant.id, code: '1ac' } },
  });
  if (level1ac) {
    const PROGRAMME_1AC = [
      { code: 'math', label: 'Mathématiques',      weeklyHours: 5, coefficient: 4 },
      { code: 'fr',   label: 'Français',           weeklyHours: 4, coefficient: 3 },
      { code: 'ar',   label: 'Arabe',              weeklyHours: 5, coefficient: 3 },
      { code: 'phys', label: 'Sciences physiques', weeklyHours: 3, coefficient: 2 },
      { code: 'svt',  label: 'SVT',                weeklyHours: 2, coefficient: 2 },
    ];
    for (const [order, p] of PROGRAMME_1AC.entries()) {
      const subj = await prisma.subject.findFirst({
        where: {
          tenantId: tenant.id,
          OR: [{ code: p.code }, { label: p.label }],
        },
      });
      if (!subj) continue;
      await prisma.curriculumSubject.upsert({
        where: { levelId_subjectId: { levelId: level1ac.id, subjectId: subj.id } },
        update: { weeklyHours: p.weeklyHours, coefficient: p.coefficient, order },
        create: {
          tenantId: tenant.id,
          levelId: level1ac.id,
          subjectId: subj.id,
          weeklyHours: p.weeklyHours,
          coefficient: p.coefficient,
          order,
        },
      });
    }
    console.log(`  ✓ Programme 1AC : ${PROGRAMME_1AC.length} matières (total ${PROGRAMME_1AC.reduce((s, p) => s + p.weeklyHours, 0)}h/sem)`);
  }

  // 7.quater Contrat démo + matière + affectation pour Amina
  const aminaUpd = await prisma.person.findFirst({
    where: { tenantId: tenant.id, type: PersonType.TEACHER, firstName: 'Amina' },
  });
  if (aminaUpd) {
    // Donne à Amina un CDI + date d'entrée si pas déjà fait.
    if (!aminaUpd.hireDate) {
      await prisma.person.update({
        where: { id: aminaUpd.id },
        data: {
          contractType: ContractType.CDI,
          hireDate: new Date('2024-09-01'),
        },
      });
    }
    // Données RH/financières démo — appliquées si absentes (idempotent).
    if (aminaUpd.grossSalary === null || aminaUpd.experienceYears === null) {
      await prisma.person.update({
        where: { id: aminaUpd.id },
        data: {
          experienceYears: 8,
          availability: {
            MON: [{ from: '08:00', to: '12:00' }, { from: '14:00', to: '17:00' }],
            TUE: [{ from: '08:00', to: '12:00' }],
            WED: [{ from: '08:00', to: '12:00' }],
            THU: [{ from: '08:00', to: '12:00' }, { from: '14:00', to: '17:00' }],
            FRI: [{ from: '08:00', to: '12:00' }],
          },
          rib: '007 780 0001234567890123 45',
          bankName: 'Attijariwafa Bank',
          payrollMethod: PayrollPaymentMethod.BANK_TRANSFER,
          grossSalary: 12000,
          netSalary: 9800,
          benefits: [
            { label: 'Prime de transport', amount: 800 },
            { label: 'Prime de rendement', amount: 500 },
          ],
          deductions: [],
        },
      });
    }
    // Spécialités + cycles + diplômes (idempotent) — recherche tolérante au renommage de code.
    const subjMath = await prisma.subject.findFirst({
      where: {
        tenantId: tenant.id,
        OR: [{ code: 'math' }, { label: 'Mathématiques' }],
      },
    });
    const subjPhys = await prisma.subject.findFirst({
      where: {
        tenantId: tenant.id,
        OR: [{ code: 'phys' }, { label: 'Sciences physiques' }],
      },
    });
    for (const subj of [subjMath, subjPhys].filter(Boolean) as Array<{ id: string }>) {
      await prisma.teacherSpecialty
        .create({
          data: { tenantId: tenant.id, teacherId: aminaUpd.id, subjectId: subj.id },
        })
        .catch(() => null);
    }
    const cycleCol = await prisma.cycle.findFirst({
      where: { tenantId: tenant.id, code: 'college' },
    });
    if (cycleCol) {
      await prisma.teacherCycle
        .create({ data: { tenantId: tenant.id, teacherId: aminaUpd.id, cycleId: cycleCol.id } })
        .catch(() => null);
    }
    const hasDiploma = await prisma.diploma.findFirst({ where: { personId: aminaUpd.id } });
    if (!hasDiploma) {
      await prisma.diploma.createMany({
        data: [
          {
            tenantId: tenant.id,
            personId: aminaUpd.id,
            title: 'Master en didactique des mathématiques',
            institution: 'Université Hassan II Casablanca',
            year: 2016,
            order: 0,
          },
          {
            tenantId: tenant.id,
            personId: aminaUpd.id,
            title: 'CAPES Mathématiques',
            institution: 'CRMEF Rabat',
            year: 2017,
            order: 1,
          },
        ],
      });
    }
    // Matière Maths (idempotent) — tolérante au renommage de code/label
    const maths =
      (await prisma.subject.findFirst({
        where: {
          tenantId: tenant.id,
          OR: [{ code: 'math' }, { label: 'Mathématiques' }],
        },
      })) ??
      (await prisma.subject.create({
        data: { tenantId: tenant.id, code: 'math', label: 'Mathématiques', coefficient: 4, order: 1 },
      }));
    // Une classe existante (la 1ère trouvée) pour l'affectation démo
    const classe = await prisma.class.findFirst({
      where: { tenantId: tenant.id, deletedAt: null },
    });
    if (classe) {
      try {
        await prisma.teacherAssignment.create({
          data: {
            tenantId: tenant.id,
            teacherId: aminaUpd.id,
            subjectId: maths.id,
            classId: classe.id,
            academicYearId: year.id,
            hoursPerWeek: 4,
          },
        });
      } catch {
        // existe déjà — OK
      }
    }
  }

  // 7.quinquies Un CDD démo qui expire dans ~25 jours (déclenche EXPIRES_30)
  const existingCDD = await prisma.person.findFirst({
    where: { tenantId: tenant.id, type: PersonType.TEACHER, firstName: 'Karim' },
  });
  if (!existingCDD) {
    const cddEnd = new Date();
    cddEnd.setDate(cddEnd.getDate() + 25);
    const teacherRole = await prisma.personRole.findUnique({
      where: { tenantId_code: { tenantId: tenant.id, code: 'TEACHER' } },
    });
    await prisma.person.create({
      data: {
        tenantId: tenant.id,
        type: PersonType.TEACHER,
        firstName: 'Karim',
        lastName: 'Lahcen',
        gender: Gender.M,
        contacts: { email: 'karim.lahcen@demo.jawal.ma' },
        roleId: teacherRole?.id,
        contractType: ContractType.CDD,
        hireDate: new Date(new Date().getFullYear() - 1, 8, 1),
        contractEndDate: cddEnd,
      },
    });
  }

  // 8. Classe + enseignant principal + élèves (idempotent : on saute si déjà présent)
  const existingTeacher = await prisma.person.findFirst({
    where: { tenantId: tenant.id, type: PersonType.TEACHER },
  });
  if (!existingTeacher) {
    const mainTeacherRole = await prisma.personRole.findUnique({
      where: { tenantId_code: { tenantId: tenant.id, code: 'MAIN_TEACHER' } },
    });
    const teacher = await prisma.person.create({
      data: {
        tenantId: tenant.id,
        type: PersonType.TEACHER,
        firstName: 'Amina',
        lastName: 'El Idrissi',
        gender: Gender.F,
        contacts: { email: 'amina.elidrissi@demo.jawal.ma' },
        roleId: mainTeacherRole?.id,
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
    const createdStudents: { id: string; lastName: string }[] = [];
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
      createdStudents.push({ id: p.id, lastName: s.lastName });
    }

    // 8.bis Parent de démo + liens de parenté (les 2 Benani sont frères)
    const fatherBenani = await prisma.person.create({
      data: {
        tenantId: tenant.id,
        type: PersonType.PARENT,
        firstName: 'Hassan',
        lastName: 'Benani',
        gender: Gender.M,
        contacts: { email: 'hassan.benani@demo.jawal.ma', phone: '+212612345678' },
      },
    });
    const motherBenani = await prisma.person.create({
      data: {
        tenantId: tenant.id,
        type: PersonType.PARENT,
        firstName: 'Fatima',
        lastName: 'Benani',
        gender: Gender.F,
        contacts: { email: 'fatima.benani@demo.jawal.ma', phone: '+212698765432' },
      },
    });
    // 2e enfant Benani pour démontrer la fratrie déduite
    const yassine = createdStudents.find((s) => s.lastName === 'Benani')!;
    const youssra = await prisma.person.create({
      data: {
        tenantId: tenant.id,
        type: PersonType.STUDENT,
        firstName: 'Youssra',
        lastName: 'Benani',
        gender: Gender.F,
        birthDate: new Date('2015-09-20'),
      },
    });
    await prisma.studentClass.create({
      data: { tenantId: tenant.id, studentId: youssra.id, classId: classe.id },
    });
    for (const childId of [yassine.id, youssra.id]) {
      await prisma.personRelation.create({
        data: { tenantId: tenant.id, childId, parentId: fatherBenani.id, type: RelationType.FATHER },
      });
      await prisma.personRelation.create({
        data: { tenantId: tenant.id, childId, parentId: motherBenani.id, type: RelationType.MOTHER },
      });
    }
    console.log(`  ✓ 1 enseignant, 1 classe (1AC-A), ${students.length + 1} élèves, 2 parents Benani + fratrie`);
  } else {
    console.log(`  ✓ Données pédagogiques déjà présentes (skip)`);
  }

  // 8.ter Parents Benani + fratrie déduite (idempotent — créés même si étape 8 est skippée)
  const existingFatherBenani = await prisma.person.findFirst({
    where: { tenantId: tenant.id, type: PersonType.PARENT, lastName: 'Benani', firstName: 'Hassan' },
  });
  if (!existingFatherBenani) {
    const yassineDb = await prisma.person.findFirst({
      where: { tenantId: tenant.id, type: PersonType.STUDENT, firstName: 'Yassine', lastName: 'Benani' },
    });
    if (yassineDb) {
      const classe = await prisma.studentClass.findFirst({
        where: { tenantId: tenant.id, studentId: yassineDb.id },
        include: { class: true },
      });
      const fatherBenani = await prisma.person.create({
        data: {
          tenantId: tenant.id,
          type: PersonType.PARENT,
          firstName: 'Hassan',
          lastName: 'Benani',
          gender: Gender.M,
          contacts: { email: 'hassan.benani@demo.jawal.ma', phone: '+212612345678' },
        },
      });
      const motherBenani = await prisma.person.create({
        data: {
          tenantId: tenant.id,
          type: PersonType.PARENT,
          firstName: 'Fatima',
          lastName: 'Benani',
          gender: Gender.F,
          contacts: { email: 'fatima.benani@demo.jawal.ma', phone: '+212698765432' },
        },
      });
      const youssra = await prisma.person.create({
        data: {
          tenantId: tenant.id,
          type: PersonType.STUDENT,
          firstName: 'Youssra',
          lastName: 'Benani',
          gender: Gender.F,
          birthDate: new Date('2015-09-20'),
        },
      });
      if (classe?.classId) {
        await prisma.studentClass.create({
          data: { tenantId: tenant.id, studentId: youssra.id, classId: classe.classId },
        });
      }
      for (const childId of [yassineDb.id, youssra.id]) {
        await prisma.personRelation.create({
          data: { tenantId: tenant.id, childId, parentId: fatherBenani.id, type: RelationType.FATHER },
        });
        await prisma.personRelation.create({
          data: { tenantId: tenant.id, childId, parentId: motherBenani.id, type: RelationType.MOTHER },
        });
      }
      console.log(`  ✓ Famille Benani démo : 2 parents + 1 sœur (Youssra) → fratrie déduite OK`);
    }
  }

  // 8.quater Accès portail parent de démo (Hassan Benani) — idempotent.
  const fatherForLogin = await prisma.person.findFirst({
    where: { tenantId: tenant.id, type: PersonType.PARENT, lastName: 'Benani', firstName: 'Hassan' },
  });
  if (fatherForLogin) {
    const parentPasswordHash = await bcrypt.hash(DEMO_PARENT_PASSWORD, 10);
    const parentUser = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: DEMO_PARENT_EMAIL } },
      update: { passwordHash: parentPasswordHash },
      create: {
        tenantId: tenant.id,
        email: DEMO_PARENT_EMAIL,
        passwordHash: parentPasswordHash,
        emailVerified: new Date(),
        locale: 'fr',
      },
    });
    const parentRoleId = rolesByCode.get('parent');
    if (parentRoleId) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: parentUser.id, roleId: parentRoleId } },
        update: {},
        create: { tenantId: tenant.id, userId: parentUser.id, roleId: parentRoleId },
      });
    }
    await prisma.userPerson.upsert({
      where: { userId_personId: { userId: parentUser.id, personId: fatherForLogin.id } },
      update: {},
      create: {
        tenantId: tenant.id,
        userId: parentUser.id,
        personId: fatherForLogin.id,
        relationship: 'parent',
      },
    });
    console.log(`  ✓ Accès portail parent : ${DEMO_PARENT_EMAIL} / ${DEMO_PARENT_PASSWORD}`);
  }

  // 11.bis Inscriptions (Enrollments) — rétroactif pour les élèves Benani
  // déjà rattachés à 1AC-A (Yassine ACTIVE rang 1, Youssra ACTIVE rang 2 avec
  // réduction fratrie 10%). + Salma en DRAFT pour démo du workflow.
  const enrollmentsExist = await prisma.enrollment.count({
    where: { tenantId: tenant.id, academicYearId: year.id },
  });
  if (enrollmentsExist === 0) {
    const level1ac = await prisma.level.findUniqueOrThrow({
      where: { tenantId_code: { tenantId: tenant.id, code: '1ac' } },
    });
    const classe1ac = await prisma.class.findFirstOrThrow({
      where: { tenantId: tenant.id, levelId: level1ac.id, academicYearId: year.id },
    });

    const yassineDb = await prisma.person.findFirst({
      where: { tenantId: tenant.id, type: PersonType.STUDENT, firstName: 'Yassine', lastName: 'Benani' },
    });
    const youssraDb = await prisma.person.findFirst({
      where: { tenantId: tenant.id, type: PersonType.STUDENT, firstName: 'Youssra', lastName: 'Benani' },
    });
    const salmaDb = await prisma.person.findFirst({
      where: { tenantId: tenant.id, type: PersonType.STUDENT, firstName: 'Salma' },
    });

    if (yassineDb) {
      await prisma.enrollment.create({
        data: {
          tenantId: tenant.id,
          studentId: yassineDb.id,
          academicYearId: year.id,
          levelId: level1ac.id,
          classId: classe1ac.id,
          status: 'ACTIVE',
          siblingRank: 1,
          discountPct: null,
          feesGenerated: true,
          validatedAt: new Date(),
        },
      });
    }
    if (youssraDb) {
      await prisma.enrollment.create({
        data: {
          tenantId: tenant.id,
          studentId: youssraDb.id,
          academicYearId: year.id,
          levelId: level1ac.id,
          classId: classe1ac.id,
          status: 'ACTIVE',
          siblingRank: 2,
          discountPct: 10,
          discountReason: 'Réduction fratrie (2ᵉ enfant Benani)',
          feesGenerated: true,
          validatedAt: new Date(),
        },
      });
    }
    if (salmaDb) {
      await prisma.enrollment.create({
        data: {
          tenantId: tenant.id,
          studentId: salmaDb.id,
          academicYearId: year.id,
          levelId: level1ac.id,
          status: 'DRAFT',
          notes: 'Préinscription en attente de validation',
        },
      });
    }
    console.log(`  ✓ Enrollments démo : Yassine + Youssra ACTIVE (fratrie 10%), Salma DRAFT`);
  } else {
    console.log(`  ✓ Enrollments déjà présents (${enrollmentsExist})`);
  }

  // 11.ter Tenant settings : siblingDiscountPct par défaut 10 (idempotent)
  const currentTenant = await prisma.tenant.findUnique({ where: { id: tenant.id } });
  const settings = (currentTenant?.settings ?? {}) as Record<string, unknown>;
  if (settings.siblingDiscountPct === undefined) {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { settings: { ...settings, siblingDiscountPct: 10 } },
    });
    console.log(`  ✓ Tenant setting siblingDiscountPct = 10`);
  }

  // 12. Pointage personnel — 5 jours pour Amina (idempotent)
  const aminaForAttendance = await prisma.person.findFirst({
    where: { tenantId: tenant.id, type: PersonType.TEACHER, firstName: 'Amina' },
    select: { id: true, grossSalary: true },
  });
  if (aminaForAttendance) {
    const existingCount = await prisma.staffAttendance.count({
      where: { personId: aminaForAttendance.id },
    });
    if (existingCount === 0) {
      const gross = aminaForAttendance.grossSalary
        ? Number(aminaForAttendance.grossSalary)
        : 12000;
      const dailyRate = gross / 26;
      const hourlyRate = gross / 26 / 8;

      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      // 5 derniers jours ouvrables (skip dim/sam pour rester réaliste FR/MA)
      const days: { offset: number; status: string; lateMinutes?: number; deduction: number; note?: string }[] = [];
      let offset = 1;
      while (days.length < 5) {
        const candidate = new Date(today);
        candidate.setUTCDate(candidate.getUTCDate() - offset);
        const wd = candidate.getUTCDay();
        if (wd !== 0 && wd !== 6) {
          let entry: (typeof days)[number];
          switch (days.length) {
            case 0:
              entry = { offset, status: 'PRESENT', deduction: 0 };
              break;
            case 1:
              entry = { offset, status: 'PRESENT', deduction: 0 };
              break;
            case 2:
              // Retard 25 min : 10 min facturables
              entry = {
                offset,
                status: 'LATE',
                lateMinutes: 25,
                deduction: Math.round(((hourlyRate * 10) / 60) * 100) / 100,
                note: 'Retard transport',
              };
              break;
            case 3:
              entry = {
                offset,
                status: 'ABSENT',
                deduction: Math.round(dailyRate * 100) / 100,
                note: 'Absence non justifiée',
              };
              break;
            case 4:
              entry = { offset, status: 'PRESENT', deduction: 0 };
              break;
            default:
              entry = { offset, status: 'PRESENT', deduction: 0 };
          }
          days.push(entry);
        }
        offset += 1;
      }

      for (const d of days) {
        const date = new Date(today);
        date.setUTCDate(date.getUTCDate() - d.offset);
        await prisma.staffAttendance.create({
          data: {
            tenantId: tenant.id,
            personId: aminaForAttendance.id,
            date,
            status: d.status as 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' | 'LEAVE',
            lateMinutes: d.lateMinutes ?? null,
            deductionAmount: d.deduction,
            note: d.note ?? null,
          },
        });
      }
      const totalDeduction = days.reduce((s, d) => s + d.deduction, 0);
      console.log(
        `  ✓ Pointage Amina : 5 jours (3 PRESENT, 1 LATE, 1 ABSENT) → retenues calculées ${totalDeduction.toFixed(2)} MAD`,
      );
    } else {
      console.log(`  ✓ Pointage Amina déjà présent (${existingCount} entrées)`);
    }
  }

  // 13. Emploi du temps — grille horaire standard + EDT type pour 1AC-A
  const slotsCount = await prisma.timetableSlot.count({ where: { tenantId: tenant.id } });
  if (slotsCount === 0) {
    const slotDefs = [
      { start: '08:00', end: '09:00', label: null, isBreak: false, order: 1 },
      { start: '09:00', end: '10:00', label: null, isBreak: false, order: 2 },
      { start: '10:00', end: '10:15', label: 'Récréation', isBreak: true, order: 3 },
      { start: '10:15', end: '11:15', label: null, isBreak: false, order: 4 },
      { start: '11:15', end: '12:15', label: null, isBreak: false, order: 5 },
      { start: '12:15', end: '14:00', label: 'Pause déjeuner', isBreak: true, order: 6 },
      { start: '14:00', end: '15:00', label: null, isBreak: false, order: 7 },
      { start: '15:00', end: '16:00', label: null, isBreak: false, order: 8 },
    ];
    for (const s of slotDefs) {
      await prisma.timetableSlot.create({
        data: {
          tenantId: tenant.id,
          startTime: s.start,
          endTime: s.end,
          label: s.label,
          isBreak: s.isBreak,
          order: s.order,
        },
      });
    }
    console.log(`  ✓ Grille horaire : ${slotDefs.length} créneaux (6 cours + 2 pauses)`);

    // EDT type pour 1AC-A : place Amina en maths sur lundi 08-09 + 09-10
    const classe1ac = await prisma.class.findFirst({
      where: { tenantId: tenant.id, academicYearId: year.id },
    });
    const amina = await prisma.person.findFirst({
      where: { tenantId: tenant.id, type: PersonType.TEACHER, firstName: 'Amina' },
    });
    const maths = await prisma.subject.findFirst({
      where: { tenantId: tenant.id, label: 'Mathématiques' },
    });
    const slots = await prisma.timetableSlot.findMany({
      where: { tenantId: tenant.id, isBreak: false },
      orderBy: { order: 'asc' },
    });
    if (classe1ac && amina && maths && slots.length >= 2) {
      const monMorning = slots.slice(0, 2);
      for (const slot of monMorning) {
        await prisma.timetableEntry.create({
          data: {
            tenantId: tenant.id,
            academicYearId: year.id,
            classId: classe1ac.id,
            slotId: slot.id,
            dayOfWeek: 'MON',
            subjectId: maths.id,
            teacherId: amina.id,
          },
        });
      }
      console.log(`  ✓ EDT démo : Amina · Maths · 1AC-A lundi 08h-10h (2 créneaux)`);
    }
  } else {
    console.log(`  ✓ Grille horaire déjà présente (${slotsCount} créneaux)`);
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
