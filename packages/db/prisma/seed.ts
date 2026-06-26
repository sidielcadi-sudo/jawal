import {
  PrismaClient,
  TenantProfile,
  TenantStatus,
  PersonType,
  Gender,
  PeriodKind,
  RelationType,
  ContractType,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ─── RNG déterministe (reproductible) ──────────────────────────
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260610);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;

// ─── Nomenclatures ─────────────────────────────────────────────
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
  { code: 'TEACHER', labelFr: 'Professeur', labelAr: 'أستاذ', order: 10 },
  { code: 'MAIN_TEACHER', labelFr: 'Professeur principal', labelAr: 'أستاذ رئيسي', order: 20 },
  { code: 'SUBJECT_COORDINATOR', labelFr: 'Coordinateur de matière', labelAr: 'منسق المادة', order: 30 },
  { code: 'LEVEL_COORDINATOR', labelFr: 'Coordinateur de niveau', labelAr: 'منسق المستوى', order: 40 },
  { code: 'LIBRARIAN_TEACHER', labelFr: 'Documentaliste pédagogique', labelAr: 'موثق تربوي', order: 50 },
] as const;

const STAFF_ROLES = [
  { code: 'DIRECTOR', labelFr: 'Directeur', labelAr: 'المدير', order: 10 },
  { code: 'DEPUTY_DIRECTOR', labelFr: 'Directeur adjoint', labelAr: 'نائب المدير', order: 20 },
  { code: 'EDUCATION_ADVISOR', labelFr: "Conseiller principal d'éducation", labelAr: 'مستشار التربية الرئيسي', order: 30 },
  { code: 'BURSAR', labelFr: 'Gestionnaire', labelAr: 'المسير المالي', order: 40 },
  { code: 'SUPERVISOR', labelFr: 'Surveillant général', labelAr: 'الحارس العام', order: 50 },
  { code: 'MONITOR', labelFr: 'Surveillant', labelAr: 'المراقب', order: 60 },
  { code: 'SECRETARY', labelFr: 'Secrétaire', labelAr: 'كاتب الإدارة', order: 70 },
  { code: 'ACCOUNTANT', labelFr: 'Comptable', labelAr: 'المحاسب', order: 80 },
  { code: 'LIBRARIAN', labelFr: 'Bibliothécaire', labelAr: 'أمين المكتبة', order: 90 },
  { code: 'NURSE', labelFr: 'Infirmier(ère)', labelAr: 'الممرض(ة)', order: 100 },
  { code: 'IT_OFFICER', labelFr: 'Responsable informatique', labelAr: 'مسؤول المعلوميات', order: 110 },
  { code: 'MAINTENANCE', labelFr: "Agent d'entretien", labelAr: 'عامل النظافة', order: 120 },
  { code: 'SECURITY', labelFr: 'Agent de sécurité', labelAr: 'عون الأمن', order: 130 },
  { code: 'DRIVER', labelFr: 'Chauffeur', labelAr: 'السائق', order: 140 },
] as const;

const SERVICES = [
  { code: 'DIRECTION', labelFr: 'Direction', labelAr: 'المديرية', order: 10 },
  { code: 'VIE_SCOLAIRE', labelFr: 'Vie scolaire', labelAr: 'الحياة المدرسية', order: 20 },
  { code: 'ENSEIGNANTS', labelFr: 'Enseignants', labelAr: 'هيئة التدريس', order: 30 },
  { code: 'ADMINISTRATION', labelFr: 'Administration', labelAr: 'الإدارة', order: 40 },
  { code: 'INTENDANCE', labelFr: 'Intendance', labelAr: 'الاقتصاد والمالية', order: 50 },
  { code: 'TECHNIQUES', labelFr: 'Techniques', labelAr: 'المصالح التقنية', order: 60 },
  { code: 'SANTE', labelFr: 'Santé', labelAr: 'الصحة', order: 70 },
  { code: 'ORIENTATION', labelFr: 'Orientation', labelAr: 'التوجيه', order: 80 },
  { code: 'CDI', labelFr: 'CDI', labelAr: 'مركز التوثيق والإعلام', order: 90 },
  { code: 'SOCIAL', labelFr: 'Social', labelAr: 'الشؤون الاجتماعية', order: 100 },
] as const;
const TEACHER_SERVICE_CODE = 'ENSEIGNANTS';
const STAFF_ROLE_SERVICE: Record<string, string> = {
  DIRECTOR: 'DIRECTION',
  DEPUTY_DIRECTOR: 'DIRECTION',
  EDUCATION_ADVISOR: 'VIE_SCOLAIRE',
  SUPERVISOR: 'VIE_SCOLAIRE',
  MONITOR: 'VIE_SCOLAIRE',
  BURSAR: 'INTENDANCE',
  ACCOUNTANT: 'INTENDANCE',
  SECRETARY: 'ADMINISTRATION',
  LIBRARIAN: 'CDI',
  NURSE: 'SANTE',
  IT_OFFICER: 'TECHNIQUES',
  MAINTENANCE: 'TECHNIQUES',
  SECURITY: 'TECHNIQUES',
  DRIVER: 'TECHNIQUES',
};

const CORE_MODULES = ['core', 'admissions', 'scolarite', 'edt', 'presences', 'notes', 'examens', 'lms', 'communication', 'finance'];

// Motifs d'absence / appel (paramétrage > Motifs). Liste complète.
const ATTENDANCE_REASONS = [
  { label: 'CONVOCATION ADMINISTRATIVE', color: 'cyan', order: 1 },
  { label: 'DIVERS', color: 'slate', order: 2, forJustification: true },
  { label: 'EXCLUSION TEMPORAIRE', color: 'red', order: 3 },
  { label: 'INFIRMERIE', color: 'cyan', order: 4 },
  { label: 'MALADIE AVEC CERTIFICAT', color: 'green', order: 5, forJustification: true },
  { label: 'MALADIE SANS CERTIFICAT', color: 'blue', order: 6, forJustification: true },
  { label: 'PROBLEME DE REVEIL', color: 'blue', order: 7 },
  { label: 'PROBLEME DE TRANSPORT', color: 'amber', order: 8, forJustification: true },
  { label: 'RAISON FAMILIALE', color: 'green', order: 9, forJustification: true },
  { label: 'RDV ASSISTANTE SOCIALE', color: 'purple', order: 10 },
  { label: 'RDV MEDICAL EXTERIEUR', color: 'rose', order: 11 },
  { label: 'RDV PSYCHOLOGUE', color: 'purple', order: 12 },
  { label: 'REUNION DELEGUES', color: 'blue', order: 13 },
  { label: 'SANS EXCUSES', color: 'red', order: 14 },
  { label: 'SORTIE SCOLAIRE OU PEDAGOGIQUE', color: 'green', order: 15 },
  { label: 'STAGE EN ENTREPRISE', color: 'amber', order: 16 },
  { label: 'VISITE MEDICALE', color: 'cyan', order: 17 },
];

// Matières du collège (code, label, coef, heures/sem) + le prof affecté.
const SUBJECTS = [
  { code: 'math', label: 'Mathématiques', coef: 4, hours: 5, teacher: { firstName: 'Amina', lastName: 'El Idrissi', gender: Gender.F } },
  { code: 'fr', label: 'Français', coef: 3, hours: 4, teacher: { firstName: 'Sophie', lastName: 'Bennani', gender: Gender.F } },
  { code: 'ar', label: 'Arabe', coef: 3, hours: 4, teacher: { firstName: 'Khalid', lastName: 'Fassi', gender: Gender.M } },
  { code: 'pc', label: 'Physique-Chimie', coef: 2, hours: 3, teacher: { firstName: 'Rachid', lastName: 'Berrada', gender: Gender.M } },
  { code: 'svt', label: 'SVT', coef: 2, hours: 2, teacher: { firstName: 'Nadia', lastName: 'Sebti', gender: Gender.F } },
  { code: 'hg', label: 'Histoire-Géographie', coef: 2, hours: 3, teacher: { firstName: 'Younes', lastName: 'El Amrani', gender: Gender.M } },
  { code: 'angl', label: 'Anglais', coef: 2, hours: 2, teacher: { firstName: 'Laila', lastName: 'Naciri', gender: Gender.F } },
  { code: 'islam', label: 'Éducation islamique', coef: 2, hours: 2, teacher: { firstName: 'Hicham', lastName: 'Lahlou', gender: Gender.M } },
  { code: 'eps', label: 'EPS', coef: 1, hours: 2, teacher: { firstName: 'Karim', lastName: 'Kettani', gender: Gender.M } },
  { code: 'info', label: 'Informatique', coef: 1, hours: 1, teacher: { firstName: 'Salma', lastName: 'Sqalli', gender: Gender.F } },
] as const;

const ROOMS = [
  { code: 'S01', label: 'Salle 01' },
  { code: 'S02', label: 'Salle 02' },
  { code: 'S03', label: 'Salle 03' },
  { code: 'S04', label: 'Salle 04' },
  { code: 'S05', label: 'Salle 05' },
  { code: 'S06', label: 'Salle 06' },
  { code: 'S07', label: 'Salle 07' },
  { code: 'S08', label: 'Salle 08' },
  { code: 'S09', label: 'Salle 09' },
  { code: 'S10', label: 'Salle 10' },
  { code: 'S11', label: 'Salle 11' },
  { code: 'S12', label: 'Salle 12' },
  { code: 'S13', label: 'Salle 13' },
  { code: 'S14', label: 'Salle 14' },
  { code: 'LABO-PC', label: 'Laboratoire Physique-Chimie' },
  { code: 'LABO-SVT', label: 'Laboratoire SVT' },
  { code: 'INFO', label: 'Salle informatique' },
  { code: 'GYM', label: 'Gymnase' },
];

const SLOTS = [
  { start: '08:00', end: '09:00', label: null, isBreak: false, order: 1 },
  { start: '09:00', end: '10:00', label: null, isBreak: false, order: 2 },
  { start: '10:00', end: '10:15', label: 'Récréation', isBreak: true, order: 3 },
  { start: '10:15', end: '11:15', label: null, isBreak: false, order: 4 },
  { start: '11:15', end: '12:15', label: null, isBreak: false, order: 5 },
  { start: '12:15', end: '14:00', label: 'Pause déjeuner', isBreak: true, order: 6 },
  { start: '14:00', end: '15:00', label: null, isBreak: false, order: 7 },
  { start: '15:00', end: '16:00', label: null, isBreak: false, order: 8 },
];

const LEVELS = [
  { code: '1ac', label: '1ère année collège', order: 1 },
  { code: '2ac', label: '2ème année collège', order: 2 },
  { code: '3ac', label: '3ème année collège', order: 3 },
];
const CLASS_LETTERS = ['A', 'B', 'C', 'D', 'E'];

// Grilles tarifaires par niveau (les échéances sont GÉNÉRÉES depuis ces grilles,
// jamais en ad hoc). Cadence déduite du nb d'échéances : 3 = trimestriel,
// 9 = mensuel, 1 = annuel.
const FEES = [
  { label: "Frais d'inscription", category: 'TUITION', count: 1, firstDueMonth: 9, byLevel: { '1ac': 1000, '2ac': 1500, '3ac': 2000 } },
  { label: 'Scolarité', category: 'TUITION', count: 3, firstDueMonth: 9, byLevel: { '1ac': 9000, '2ac': 12000, '3ac': 15000 } },
  { label: 'Cantine', category: 'CANTEEN', count: 9, firstDueMonth: 9, byLevel: { '1ac': 2000, '2ac': 2500, '3ac': 3000 } },
  { label: 'Transport', category: 'TRANSPORT', count: 9, firstDueMonth: 9, byLevel: { '1ac': 2000, '2ac': 2500, '3ac': 3000 } },
] as const;

function stepMonths(count: number): number {
  return Math.max(1, Math.round(9 / Math.max(1, count)));
}

/** Échéances d'une grille : montant réparti sur `count`, espacé selon la cadence. */
function buildInstallments(
  fee: { label: string; totalAmount: number; installmentCount: number; firstDueMonth: number },
  yearStart: Date,
): { label: string; amount: number; dueDate: Date }[] {
  const count = Math.max(1, Math.floor(fee.installmentCount));
  const step = stepMonths(count);
  const per = Math.round((fee.totalAmount / count) * 100) / 100;
  const out: { label: string; amount: number; dueDate: Date }[] = [];
  for (let i = 0; i < count; i++) {
    const offset = fee.firstDueMonth - 1 + i * step;
    const m = offset % 12;
    const yo = Math.floor(offset / 12);
    const amount = i === count - 1 ? Math.round((fee.totalAmount - per * (count - 1)) * 100) / 100 : per;
    out.push({
      label: `${fee.label} (${i + 1}/${count})`,
      amount,
      dueDate: new Date(Date.UTC(yearStart.getUTCFullYear() + yo, m, 5)),
    });
  }
  return out;
}

const FIRST_M = ['Adam', 'Omar', 'Mehdi', 'Anas', 'Bilal', 'Ayoub', 'Hamza', 'Youssef', 'Zakaria', 'Ilyas', 'Rayan', 'Amine', 'Soufiane', 'Nabil', 'Walid'];
const FIRST_F = ['Lina', 'Nour', 'Hiba', 'Imane', 'Sara', 'Aya', 'Maryam', 'Ghita', 'Rim', 'Doha', 'Hind', 'Kenza', 'Asma', 'Salma', 'Wiam'];
const LASTS = ['Cherkaoui', 'Tazi', 'Alaoui', 'Fassi', 'Berrada', 'El Amrani', 'Naciri', 'Bouzoubaa', 'Lahlou', 'Kettani', 'El Khattabi', 'Sqalli', 'Bennis', 'Chraibi', 'Hassani', 'Ouazzani', 'Mansouri', 'Idrissi', 'Bennani', 'Saidi'];

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'] as const;

// Comptes de démo
const DEMO = {
  admin: { email: 'admin@demo.jawal.ma', password: 'demo1234' },
  super: { email: 'super@jawal.ma', password: 'super1234' },
  parent: { email: 'hassan.benani@demo.jawal.ma', password: 'parent1234' },
  teacher: { email: 'amina.prof@demo.jawal.ma', password: 'prof1234' },
  student: { email: 'yassine.benani@demo.jawal.ma', password: 'eleve1234' },
  direction: { email: 'directeur@demo.jawal.ma', password: 'direction1234' },
  viesco: { email: 'vie.scolaire@demo.jawal.ma', password: 'cpe1234' },
  comptable: { email: 'comptable@demo.jawal.ma', password: 'finance1234' },
};

const periodLabelOf = (s: string, e: string) => `${s}-${e}`;

async function main() {
  console.log('🌱 Seed Jawal — base propre (collège)…');

  // 0. VIDER LA BASE (cascade depuis Tenant)
  await prisma.tenant.deleteMany({});
  console.log('  🧹 Base vidée.');

  // 1. Tenant
  const tenant = await prisma.tenant.create({
    data: {
      slug: 'demo',
      name: 'Collège Al Massira',
      profile: TenantProfile.K12,
      status: TenantStatus.ACTIVE,
      localeDefault: 'fr',
      currency: 'MAD',
      timezone: 'Africa/Casablanca',
      settings: {
        siblingDiscountPct: 10,
        // Réglages EDT : mercredi & samedi après-midi non travaillés (norme MA).
        days: {
          MON: 'FULL',
          TUE: 'FULL',
          WED: 'MORNING_ONLY',
          THU: 'FULL',
          FRI: 'FULL',
          SAT: 'MORNING_ONLY',
          SUN: 'OFF',
        },
        morningEndsAt: '13:00',
      },
    },
  });
  console.log(`  ✓ Tenant : ${tenant.name}`);

  // 2. Modules
  await prisma.tenantModule.createMany({
    data: CORE_MODULES.map((code) => ({ tenantId: tenant.id, code, enabled: true })),
  });

  // 3. Motifs d'absence
  await prisma.attendanceReason.createMany({
    data: ATTENDANCE_REASONS.map((r) => ({ tenantId: tenant.id, ...r })),
  });
  const reasons = await prisma.attendanceReason.findMany({ where: { tenantId: tenant.id } });
  const reasonByLabel = new Map(reasons.map((r) => [r.label, r.id]));
  console.log(`  ✓ ${ATTENDANCE_REASONS.length} motifs d'absence`);

  // 4. Rôles système
  const rolesByCode = new Map<string, string>();
  for (const r of SYSTEM_ROLES) {
    const role = await prisma.role.create({
      data: { tenantId: tenant.id, code: r.code, label: r.label, permissions: [...r.permissions], isSystem: true },
    });
    rolesByCode.set(r.code, role.id);
  }

  // 5. Services + rôles personnels
  const servicesByCode = new Map<string, string>();
  for (const s of SERVICES) {
    const svc = await prisma.service.create({ data: { tenantId: tenant.id, code: s.code, labelFr: s.labelFr, labelAr: s.labelAr, order: s.order } });
    servicesByCode.set(s.code, svc.id);
  }
  const teacherServiceId = servicesByCode.get(TEACHER_SERVICE_CODE)!;
  const personRoleByCode = new Map<string, string>();
  for (const r of TEACHER_ROLES) {
    const pr = await prisma.personRole.create({
      data: { tenantId: tenant.id, appliesTo: PersonType.TEACHER, code: r.code, labelFr: r.labelFr, labelAr: r.labelAr, order: r.order, serviceId: teacherServiceId },
    });
    personRoleByCode.set(r.code, pr.id);
  }
  for (const r of STAFF_ROLES) {
    const pr = await prisma.personRole.create({
      data: { tenantId: tenant.id, appliesTo: PersonType.STAFF, code: r.code, labelFr: r.labelFr, labelAr: r.labelAr, order: r.order, serviceId: servicesByCode.get(STAFF_ROLE_SERVICE[r.code] ?? 'ADMINISTRATION') ?? null },
    });
    personRoleByCode.set(r.code, pr.id);
  }
  console.log(`  ✓ ${SERVICES.length} services, ${SYSTEM_ROLES.length} rôles, ${TEACHER_ROLES.length + STAFF_ROLES.length} rôles personnels`);

  // 6. Comptes admin / direction / vie scolaire / super-admin
  const hash = (p: string) => bcrypt.hash(p, 10);
  const adminUser = await prisma.user.create({
    data: { tenantId: tenant.id, email: DEMO.admin.email, passwordHash: await hash(DEMO.admin.password), emailVerified: new Date(), locale: 'fr' },
  });
  await prisma.userRole.create({ data: { tenantId: tenant.id, userId: adminUser.id, roleId: rolesByCode.get('tenant_admin')! } });
  for (const [role, acc] of [['direction', DEMO.direction], ['cpe', DEMO.viesco], ['comptable', DEMO.comptable]] as const) {
    const u = await prisma.user.create({ data: { tenantId: tenant.id, email: acc.email, passwordHash: await hash(acc.password), emailVerified: new Date(), locale: 'fr' } });
    await prisma.userRole.create({ data: { tenantId: tenant.id, userId: u.id, roleId: rolesByCode.get(role)! } });
  }
  await prisma.user.create({
    data: { tenantId: tenant.id, email: DEMO.super.email, passwordHash: await hash(DEMO.super.password), emailVerified: new Date(), isSuperAdmin: true, locale: 'fr' },
  });

  // 7. Année + trimestres
  const year = await prisma.academicYear.create({
    data: { tenantId: tenant.id, label: '2025-2026', startDate: new Date('2025-09-01'), endDate: new Date('2026-07-15'), active: true },
  });
  const trimesters = [
    { label: 'Trimestre 1', start: '2025-09-01', end: '2025-12-15' },
    { label: 'Trimestre 2', start: '2026-01-05', end: '2026-03-31' },
    { label: 'Trimestre 3', start: '2026-04-15', end: '2026-07-10' },
  ];
  const periods: { id: string; label: string; start: Date; end: Date }[] = [];
  for (const tri of trimesters) {
    const p = await prisma.period.create({
      data: { tenantId: tenant.id, academicYearId: year.id, kind: PeriodKind.TRIMESTER, label: tri.label, startDate: new Date(tri.start), endDate: new Date(tri.end) },
    });
    periods.push({ id: p.id, label: p.label, start: new Date(tri.start), end: new Date(tri.end) });
  }
  console.log(`  ✓ Année ${year.label} + 3 trimestres`);

  // 8. Cycle collège + niveaux
  const cycle = await prisma.cycle.create({ data: { tenantId: tenant.id, code: 'college', label: 'Collège', order: 1 } });
  const levelByCode = new Map<string, string>();
  for (const l of LEVELS) {
    const lvl = await prisma.level.create({ data: { tenantId: tenant.id, cycleId: cycle.id, code: l.code, label: l.label, order: l.order } });
    levelByCode.set(l.code, lvl.id);
  }

  // 8b. Grilles tarifaires par niveau (source des échéances)
  type Grille = { id: string; label: string; category: string; totalAmount: number; installmentCount: number; firstDueMonth: number };
  const grillesByLevelId = new Map<string, Grille[]>();
  for (const l of LEVELS) {
    const levelId = levelByCode.get(l.code)!;
    const arr: Grille[] = [];
    for (const f of FEES) {
      const totalAmount = f.byLevel[l.code as keyof typeof f.byLevel];
      const g = await prisma.feeScheduleItem.create({
        data: {
          tenantId: tenant.id,
          academicYearId: year.id,
          levelId,
          label: f.label,
          kind: 'ANNUAL',
          category: f.category as never,
          totalAmount,
          installmentCount: f.count,
          firstDueMonth: f.firstDueMonth,
        },
      });
      arr.push({ id: g.id, label: f.label, category: f.category, totalAmount, installmentCount: f.count, firstDueMonth: f.firstDueMonth });
    }
    grillesByLevelId.set(levelId, arr);
  }
  console.log(`  ✓ Grilles tarifaires (${FEES.length} × ${LEVELS.length} niveaux)`);

  // 9. Matières + programme par niveau
  const subjectByCode = new Map<string, string>();
  for (const s of SUBJECTS) {
    const subj = await prisma.subject.create({ data: { tenantId: tenant.id, code: s.code, label: s.label, coefficient: s.coef, order: SUBJECTS.indexOf(s) * 10 } });
    subjectByCode.set(s.code, subj.id);
  }
  for (const lvlId of levelByCode.values()) {
    for (const [i, s] of SUBJECTS.entries()) {
      await prisma.curriculumSubject.create({
        data: { tenantId: tenant.id, levelId: lvlId, subjectId: subjectByCode.get(s.code)!, weeklyHours: s.hours, coefficient: s.coef, order: i },
      });
    }
  }
  console.log(`  ✓ Cycle Collège, ${LEVELS.length} niveaux, ${SUBJECTS.length} matières + programme`);

  // 10. Salles
  await prisma.room.createMany({ data: ROOMS.map((r) => ({ tenantId: tenant.id, code: r.code, label: r.label, capacity: 30 })) });
  const rooms = await prisma.room.findMany({ where: { tenantId: tenant.id } });

  // 11. Créneaux horaires
  await prisma.timetableSlot.createMany({
    data: SLOTS.map((s) => ({ tenantId: tenant.id, startTime: s.start, endTime: s.end, label: s.label, isBreak: s.isBreak, order: s.order })),
  });
  const slots = await prisma.timetableSlot.findMany({ where: { tenantId: tenant.id }, orderBy: { order: 'asc' } });
  const courseSlots = slots.filter((s) => !s.isBreak);

  // 12. Enseignants — PLUSIEURS par matière (charge ≤ ~20h chacun, sinon FET
  // infaisable) + DISPONIBILITÉS renseignées (sans dispo, le solveur considère
  // le prof indisponible → aucune solution). Amina (maths) = compte démo prof.
  const teacherRoleId = personRoleByCode.get('TEACHER')!;
  const mainTeacherRoleId = personRoleByCode.get('MAIN_TEACHER')!;
  const NB_CLASSES = LEVELS.length * CLASS_LETTERS.length; // 15
  // Disponible toute la semaine 08:00–18:00 ; les demi-journées (mer/sam PM) sont
  // gérées par les créneaux interdits côté classe, pas ici.
  const AVAILABILITY = Object.fromEntries(
    (['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const).map((d) => [d, [{ from: '08:00', to: '18:00' }]]),
  );
  const TEACHER_FIRST = ['Samira', 'Mounir', 'Khadija', 'Brahim', 'Najat', 'Tarik', 'Houda', 'Said', 'Malika', 'Aziz', 'Rabia', 'Jamal', 'Siham', 'Adil', 'Latifa', 'Othmane', 'Zineb', 'Driss', 'Karima', 'Mustapha', 'Souad', 'Naoufal', 'Wafaa', 'Hamid', 'Sanae'];
  const TEACHER_LAST = ['Benjelloun', 'Tahiri', 'Lamrani', 'Belghiti', 'Sefrioui', 'Cherradi', 'Bargach', 'Skalli', 'Filali', 'Benkirane', 'Alami', 'Sbai', 'El Ouazzani', 'Bennis', 'Lahmidi', 'Naciri', 'Berrada', 'Fassi', 'El Khattabi', 'Sqalli', 'Kettani', 'Bouayad', 'Chraibi', 'Mernissi', 'Ziani'];

  const teachersBySubject = new Map<string, string[]>();
  const teacherIds: string[] = [];
  let tcount = 0;
  for (const s of SUBJECTS) {
    const totalHours = s.hours * NB_CLASSES;
    const n = Math.max(1, Math.ceil(totalHours / 20)); // ≤ ~20h/prof
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const isAmina = s.code === 'math' && i === 0;
      const firstName = isAmina ? 'Amina' : TEACHER_FIRST[tcount % TEACHER_FIRST.length]!;
      const lastName = isAmina ? 'El Idrissi' : TEACHER_LAST[(tcount * 3) % TEACHER_LAST.length]!;
      const email = isAmina ? 'amina.elidrissi@demo.jawal.ma' : `prof${tcount + 1}.${s.code}@demo.jawal.ma`;
      const t = await prisma.person.create({
        data: {
          tenantId: tenant.id,
          type: PersonType.TEACHER,
          firstName,
          lastName,
          gender: i % 2 === 0 ? Gender.F : Gender.M,
          contacts: { email },
          roleId: isAmina ? mainTeacherRoleId : teacherRoleId,
          serviceId: teacherServiceId,
          contractType: ContractType.CDI,
          hireDate: new Date('2022-09-01'),
          contractualHoursPerWeek: 24,
          availability: AVAILABILITY,
        },
      });
      await prisma.teacherSpecialty.create({ data: { tenantId: tenant.id, teacherId: t.id, subjectId: subjectByCode.get(s.code)! } });
      await prisma.teacherCycle.create({ data: { tenantId: tenant.id, teacherId: t.id, cycleId: cycle.id } });
      ids.push(t.id);
      teacherIds.push(t.id);
      tcount += 1;
    }
    teachersBySubject.set(s.code, ids);
  }
  const aminaId = teachersBySubject.get('math')![0]!;
  // Prof affecté à une (matière × classe) — réparti en round-robin sur les profs
  // de la matière pour équilibrer la charge.
  const teacherFor = (code: string, idx: number): string => {
    const ids = teachersBySubject.get(code)!;
    return ids[idx % ids.length]!;
  };
  console.log(`  ✓ ${tcount} enseignants (plusieurs/matière, disponibilités renseignées)`);

  // 13. Classes (5 par niveau) + élèves + EDT + affectations
  let nameIdx = 0;
  let classIdx = 0;
  const allClasses: { id: string; name: string; levelCode: string; studentIds: string[] }[] = [];
  const studentRegime = new Map<string, 'EXTERNE' | 'DEMI_PENSIONNAIRE' | 'INTERNE'>();
  const studentTransport = new Map<string, boolean>();
  const regimeOf = (firstName: string): 'EXTERNE' | 'DEMI_PENSIONNAIRE' | 'INTERNE' => {
    if (firstName === 'Yassine') return 'DEMI_PENSIONNAIRE'; // élève démo
    const r = rand();
    return r < 0.5 ? 'EXTERNE' : r < 0.85 ? 'DEMI_PENSIONNAIRE' : 'INTERNE';
  };

  for (const lvl of LEVELS) {
    for (const letter of CLASS_LETTERS) {
      const className = `${lvl.code.toUpperCase()}-${letter}`;
      const mainTeacherId = teacherIds[classIdx % teacherIds.length]!;
      const klass = await prisma.class.create({
        data: { tenantId: tenant.id, academicYearId: year.id, levelId: levelByCode.get(lvl.code)!, name: className, capacity: 32, mainTeacherId },
      });

      // Élèves (10 par classe) — 1AC-A reçoit la famille Benani (démo).
      const studentIds: string[] = [];
      const isDemoClass = className === '1AC-A';
      const roster: { firstName: string; lastName: string; gender: Gender }[] = [];
      if (isDemoClass) {
        roster.push({ firstName: 'Yassine', lastName: 'Benani', gender: Gender.M });
        roster.push({ firstName: 'Youssra', lastName: 'Benani', gender: Gender.F });
      }
      while (roster.length < 10) {
        const male = roster.length % 2 === 0;
        roster.push({
          firstName: male ? FIRST_M[nameIdx % FIRST_M.length]! : FIRST_F[nameIdx % FIRST_F.length]!,
          lastName: LASTS[(nameIdx * 7) % LASTS.length]!,
          gender: male ? Gender.M : Gender.F,
        });
        nameIdx += 1;
      }
      for (const r of roster) {
        const regime = regimeOf(r.firstName);
        const usesTransport = rand() < 0.25;
        const st = await prisma.person.create({
          data: { tenantId: tenant.id, type: PersonType.STUDENT, firstName: r.firstName, lastName: r.lastName, gender: r.gender, birthDate: new Date('2012-03-15'), regime, usesTransport },
        });
        studentRegime.set(st.id, regime);
        studentTransport.set(st.id, usesTransport);
        await prisma.studentClass.create({ data: { tenantId: tenant.id, studentId: st.id, classId: klass.id } });
        await prisma.enrollment.create({
          data: { tenantId: tenant.id, studentId: st.id, academicYearId: year.id, levelId: levelByCode.get(lvl.code)!, classId: klass.id, status: 'ACTIVE', siblingRank: 1, feesGenerated: true, validatedAt: new Date() },
        });
        studentIds.push(st.id);
      }

      // Affectations prof (round-robin par matière) pour la classe
      for (const s of SUBJECTS) {
        await prisma.teacherAssignment.create({
          data: { tenantId: tenant.id, teacherId: teacherFor(s.code, classIdx), subjectId: subjectByCode.get(s.code)!, classId: klass.id, academicYearId: year.id, hoursPerWeek: s.hours },
        });
      }

      // EDT hebdo : séquence pondérée des matières répartie sur la semaine.
      const seq: string[] = [];
      const remaining = new Map<string, number>(SUBJECTS.map((s) => [s.code, s.hours]));
      let total = SUBJECTS.reduce((a, s) => a + s.hours, 0);
      while (total > 0) {
        for (const s of SUBJECTS) {
          const left = remaining.get(s.code)!;
          if (left > 0) {
            seq.push(s.code);
            remaining.set(s.code, left - 1);
            total -= 1;
          }
        }
      }
      let k = 0;
      for (const day of WEEKDAYS) {
        for (const [si, slot] of courseSlots.entries()) {
          if (k >= seq.length) break;
          const code = seq[k++]!;
          await prisma.timetableEntry.create({
            data: {
              tenantId: tenant.id,
              academicYearId: year.id,
              classId: klass.id,
              slotId: slot.id,
              dayOfWeek: day,
              subjectId: subjectByCode.get(code)!,
              teacherId: teacherFor(code, classIdx),
              roomId: rooms[(classIdx * 6 + si) % rooms.length]!.id,
            },
          });
        }
      }

      allClasses.push({ id: klass.id, name: className, levelCode: lvl.code, studentIds });
      classIdx += 1;
    }
  }
  console.log(`  ✓ ${allClasses.length} classes (5 × ${LEVELS.length} niveaux), ${nameIdx + 2} élèves, EDT + affectations`);

  // 14. Parents Benani + portail (Yassine + Youssra de 1AC-A)
  const benaniClass = allClasses.find((c) => c.name === '1AC-A')!;
  const yassine = await prisma.person.findFirstOrThrow({ where: { tenantId: tenant.id, type: PersonType.STUDENT, firstName: 'Yassine', lastName: 'Benani' } });
  const youssra = await prisma.person.findFirstOrThrow({ where: { tenantId: tenant.id, type: PersonType.STUDENT, firstName: 'Youssra', lastName: 'Benani' } });
  const father = await prisma.person.create({ data: { tenantId: tenant.id, type: PersonType.PARENT, firstName: 'Hassan', lastName: 'Benani', gender: Gender.M, contacts: { email: DEMO.parent.email, phone: '+212612345678' } } });
  const mother = await prisma.person.create({ data: { tenantId: tenant.id, type: PersonType.PARENT, firstName: 'Fatima', lastName: 'Benani', gender: Gender.F, contacts: { email: 'fatima.benani@demo.jawal.ma', phone: '+212698765432' } } });
  for (const childId of [yassine.id, youssra.id]) {
    await prisma.personRelation.create({ data: { tenantId: tenant.id, childId, parentId: father.id, type: RelationType.FATHER } });
    await prisma.personRelation.create({ data: { tenantId: tenant.id, childId, parentId: mother.id, type: RelationType.MOTHER } });
  }

  // 15. Comptes portail parent / enseignant / élève
  const parentUser = await prisma.user.create({ data: { tenantId: tenant.id, email: DEMO.parent.email, passwordHash: await hash(DEMO.parent.password), emailVerified: new Date(), locale: 'fr' } });
  await prisma.userRole.create({ data: { tenantId: tenant.id, userId: parentUser.id, roleId: rolesByCode.get('parent')! } });
  await prisma.userPerson.create({ data: { tenantId: tenant.id, userId: parentUser.id, personId: father.id, relationship: 'parent' } });

  const teacherUser = await prisma.user.create({ data: { tenantId: tenant.id, email: DEMO.teacher.email, passwordHash: await hash(DEMO.teacher.password), emailVerified: new Date(), locale: 'fr' } });
  await prisma.userRole.create({ data: { tenantId: tenant.id, userId: teacherUser.id, roleId: rolesByCode.get('enseignant')! } });
  await prisma.userPerson.create({ data: { tenantId: tenant.id, userId: teacherUser.id, personId: aminaId, relationship: 'self' } });

  const studentUser = await prisma.user.create({ data: { tenantId: tenant.id, email: DEMO.student.email, passwordHash: await hash(DEMO.student.password), emailVerified: new Date(), locale: 'fr' } });
  await prisma.userRole.create({ data: { tenantId: tenant.id, userId: studentUser.id, roleId: rolesByCode.get('eleve')! } });
  await prisma.userPerson.create({ data: { tenantId: tenant.id, userId: studentUser.id, personId: yassine.id, relationship: 'self' } });
  console.log('  ✓ Famille Benani + comptes portail (parent / prof / élève)');

  // 16. Notes — 2 évaluations en Trimestre 1 pour math/fr/ar, toutes classes
  const t1 = periods[0]!;
  let evalCount = 0;
  for (const klass of allClasses) {
    for (const code of ['math', 'fr', 'ar'] as const) {
      for (const [n, dstr] of [['Contrôle 1', '2025-10-10'], ['Contrôle 2', '2025-11-20']] as const) {
        const ev = await prisma.evaluation.create({
          data: { tenantId: tenant.id, classId: klass.id, subjectId: subjectByCode.get(code)!, periodId: t1.id, label: n, date: new Date(dstr), weight: 1, maxValue: 20 },
        });
        await prisma.grade.createMany({
          data: klass.studentIds.map((sid) => ({ tenantId: tenant.id, evaluationId: ev.id, studentId: sid, value: Math.round((8 + rand() * 11) * 4) / 4 })),
        });
        evalCount += 1;
      }
    }
  }
  console.log(`  ✓ ${evalCount} évaluations + notes (Trimestre 1)`);

  // 17. Appels — 2 derniers jours ouvrés, ~85% finalisés (le reste = appels non faits)
  const recentDays: Date[] = [];
  {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    while (recentDays.length < 2) {
      d.setUTCDate(d.getUTCDate() - 1);
      const wd = d.getUTCDay();
      if (wd !== 0 && wd !== 6) recentDays.push(new Date(d));
    }
  }
  const sansExcusesId = reasonByLabel.get('SANS EXCUSES') ?? null;
  let sessionCount = 0;
  let absenceCount = 0;
  for (const date of recentDays) {
    const dow = DOW[date.getUTCDay()]!;
    for (const klass of allClasses) {
      const entries = await prisma.timetableEntry.findMany({
        where: { classId: klass.id, academicYearId: year.id, dayOfWeek: dow as never },
        include: { slot: { select: { startTime: true, endTime: true, isBreak: true } } },
      });
      for (const e of entries) {
        if (e.slot.isBreak) continue;
        if (rand() > 0.85) continue; // 15% d'appels non faits
        const session = await prisma.attendanceSession.create({
          data: { tenantId: tenant.id, classId: klass.id, date, periodLabel: periodLabelOf(e.slot.startTime, e.slot.endTime), finalizedAt: new Date() },
        });
        for (const sid of klass.studentIds) {
          const r = rand();
          let data: { status: 'PRESENT' | 'ABSENT' | 'LATE'; infirmary?: boolean; punishment?: boolean; exclusion?: boolean; lateMinutes?: number; lateReasonId?: string | null } = { status: 'PRESENT' };
          if (r < 0.06) {
            data = { status: 'ABSENT', lateReasonId: sansExcusesId }; // Non régularisée
            absenceCount += 1;
          } else if (r < 0.1) {
            data = { status: 'LATE', lateMinutes: 10, lateReasonId: reasonByLabel.get('PROBLEME DE TRANSPORT') ?? null };
          } else if (r < 0.12) {
            data = { status: 'ABSENT', exclusion: true }; // Exclusion de cours
          } else if (r < 0.14) {
            data = { status: 'PRESENT', infirmary: true };
          }
          await prisma.attendanceRecord.create({
            data: {
              tenantId: tenant.id,
              sessionId: session.id,
              studentId: sid,
              status: data.status,
              lateMinutes: data.lateMinutes ?? null,
              lateReasonId: data.lateReasonId ?? null,
              infirmary: data.infirmary ?? false,
              punishment: data.punishment ?? false,
              exclusion: data.exclusion ?? false,
            },
          });
        }
        sessionCount += 1;
      }
    }
  }
  console.log(`  ✓ ${sessionCount} sessions d'appel finalisées (~${absenceCount} absences) sur 2 jours`);

  // 18. Carnet de correspondance — quelques entrées pour Yassine (démo)
  const carnetSamples = [
    { type: 'ENCOURAGEMENT', content: 'Bon début de trimestre, continue ainsi.', authorRole: 'teacher' },
    { type: 'OBSERVATION', content: 'Bavardages en classe, à surveiller.', authorRole: 'teacher' },
    { type: 'CONVOCATION', content: 'Convocation des parents le vendredi à 16h.', authorRole: 'vie-scolaire' },
  ] as const;
  for (const c of carnetSamples) {
    await prisma.carnetEntry.create({
      data: {
        tenantId: tenant.id,
        studentId: yassine.id,
        type: c.type as never,
        content: c.content,
        classId: benaniClass.id,
        occurredAt: new Date('2025-10-05'),
        authorName: c.authorRole === 'teacher' ? 'Mme El Idrissi' : 'Vie scolaire',
        authorRole: c.authorRole,
        visibleToParents: true,
      },
    });
  }
  console.log('  ✓ Carnet de correspondance (3 entrées démo pour Yassine)');

  // 19. Finance — échéances GÉNÉRÉES DEPUIS LES GRILLES + paiements
  // Applicabilité : Scolarité & Frais d'inscription toujours ; Cantine si
  // demi-pension/interne ; Transport si l'élève utilise le transport.
  const PAYMENT_METHODS = ['CASH', 'CHEQUE', 'TRANSFER'] as const;
  const todayFin = new Date();
  todayFin.setUTCHours(0, 0, 0, 0);
  const yearStartFin = new Date(year.startDate);
  let instCount = 0;
  let payCount = 0;
  for (const klass of allClasses) {
    const levelId = levelByCode.get(klass.levelCode)!;
    const levelGrilles = grillesByLevelId.get(levelId) ?? [];
    for (const sid of klass.studentIds) {
      const eats = studentRegime.get(sid) !== 'EXTERNE';
      const uses = studentTransport.get(sid) ?? false;
      for (const g of levelGrilles) {
        if (g.category === 'CANTEEN' && !eats) continue;
        if (g.category === 'TRANSPORT' && !uses) continue;
        for (const it of buildInstallments(g, yearStartFin)) {
          const overdue = it.dueDate < todayFin;
          let status: 'PENDING' | 'PARTIAL' | 'PAID' = 'PENDING';
          let payAmount = 0;
          if (overdue) {
            const roll = rand();
            if (roll < 0.6) {
              status = 'PAID';
              payAmount = it.amount;
            } else if (roll < 0.8) {
              status = 'PARTIAL';
              payAmount = Math.round(it.amount * 0.5 * 100) / 100;
            }
          }
          const inst = await prisma.installment.create({
            data: {
              tenantId: tenant.id,
              studentId: sid,
              feeScheduleItemId: g.id,
              label: it.label,
              amount: it.amount,
              dueDate: it.dueDate,
              status,
            },
          });
          instCount += 1;
          if (payAmount > 0) {
            await prisma.payment.create({
              data: {
                tenantId: tenant.id,
                installmentId: inst.id,
                amount: payAmount,
                method: pick(PAYMENT_METHODS),
                paidAt: new Date(it.dueDate.getTime() + 5 * 86400000),
              },
            });
            payCount += 1;
          }
        }
      }
    }
  }
  console.log(`  ✓ Finance : ${instCount} échéances générées DEPUIS les grilles, ${payCount} paiements`);

  console.log('\n✅ Seed terminé.\n');
  console.log('────────────── Comptes de démonstration (slug: demo) ──────────────');
  console.log(`  Admin       : ${DEMO.admin.email} / ${DEMO.admin.password}`);
  console.log(`  Direction   : ${DEMO.direction.email} / ${DEMO.direction.password}`);
  console.log(`  Vie scolaire: ${DEMO.viesco.email} / ${DEMO.viesco.password}`);
  console.log(`  Comptable   : ${DEMO.comptable.email} / ${DEMO.comptable.password}`);
  console.log(`  Enseignant  : ${DEMO.teacher.email} / ${DEMO.teacher.password}`);
  console.log(`  Parent      : ${DEMO.parent.email} / ${DEMO.parent.password}`);
  console.log(`  Élève       : ${DEMO.student.email} / ${DEMO.student.password}`);
  console.log(`  Super-admin : ${DEMO.super.email} / ${DEMO.super.password} (slug vide)`);
  console.log('────────────────────────────────────────────────────────────────────\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
