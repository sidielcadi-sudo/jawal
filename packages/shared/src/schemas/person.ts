import { z } from 'zod';

export const personTypeSchema = z.enum(['STUDENT', 'PARENT', 'TEACHER', 'STAFF']);
export const genderSchema = z.enum(['M', 'F', 'X']);

export const relationTypeSchema = z.enum(['FATHER', 'MOTHER', 'LEGAL_GUARDIAN', 'GUARDIAN']);
export type RelationTypeValue = z.infer<typeof relationTypeSchema>;

export const contractTypeSchema = z.enum(['CDI', 'CDD', 'VACATAIRE', 'STAGIAIRE', 'AUTRE']);
export type ContractTypeValue = z.infer<typeof contractTypeSchema>;

/** Régime de l'élève (restauration / hébergement). */
export const regimeSchema = z.enum(['EXTERNE', 'DEMI_PENSIONNAIRE', 'INTERNE']);
export type RegimeValue = z.infer<typeof regimeSchema>;

export const payrollMethodSchema = z.enum(['BANK_TRANSFER', 'CHECK', 'CASH', 'OTHER']);
export type PayrollMethodValue = z.infer<typeof payrollMethodSchema>;

/**
 * Nomenclature des services (départements) auxquels rattacher le personnel.
 * Axe distinct de la fonction (`PersonRole`) : un agent a une fonction
 * (ex. Comptable) ET appartient à un service (ex. Comptabilité). Pertinent
 * surtout pour le type STAFF. Libellés FR/AR fournis côté i18n.
 */
export const STAFF_SERVICES = [
  'DIRECTION',
  'ADMINISTRATION',
  'SCOLARITE',
  'VIE_SCOLAIRE',
  'COMPTABILITE',
  'SERVICES_GENERAUX',
  'RESTAURATION',
  'INFIRMERIE',
  'INFORMATIQUE',
  'BIBLIOTHEQUE',
  'AUTRE',
] as const;
export const staffServiceSchema = z.enum(STAFF_SERVICES);
export type StaffServiceValue = z.infer<typeof staffServiceSchema>;

/**
 * Catalogue par défaut des services (modèle `Service`, paramétrable par tenant).
 * Remplace l'enum figé `STAFF_SERVICES`. Sert au seed initial ; ensuite éditable
 * via Paramétrage → Rôles → Services.
 */
export const DEFAULT_SERVICES = [
  { code: 'DIRECTION', labelFr: 'Direction', labelAr: 'المديرية' },
  { code: 'VIE_SCOLAIRE', labelFr: 'Vie scolaire', labelAr: 'الحياة المدرسية' },
  { code: 'ENSEIGNANTS', labelFr: 'Enseignants', labelAr: 'هيئة التدريس' },
  { code: 'ADMINISTRATION', labelFr: 'Administration', labelAr: 'الإدارة' },
  { code: 'INTENDANCE', labelFr: 'Intendance', labelAr: 'الاقتصاد والمالية' },
  { code: 'TECHNIQUES', labelFr: 'Techniques', labelAr: 'المصالح التقنية' },
  { code: 'SANTE', labelFr: 'Santé', labelAr: 'الصحة' },
  { code: 'ORIENTATION', labelFr: 'Orientation', labelAr: 'التوجيه' },
  { code: 'CDI', labelFr: 'CDI', labelAr: 'مركز التوثيق والإعلام' },
  { code: 'SOCIAL', labelFr: 'Social', labelAr: 'الشؤون الاجتماعية' },
] as const;

/** Code du service « Enseignants » : service forcé pour tout type TEACHER. */
export const TEACHER_SERVICE_CODE = 'ENSEIGNANTS';

export const serviceCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Z][A-Z0-9_]*$/, {
      message: 'Code : MAJUSCULES, chiffres et _ uniquement (commence par une lettre).',
    }),
  labelFr: z.string().trim().min(1).max(100),
  labelAr: z.string().trim().min(1).max(100),
  order: z.coerce.number().int().min(0).max(9999).default(0),
  active: z.coerce.boolean().default(true),
});
export type ServiceCreate = z.infer<typeof serviceCreateSchema>;

export const dayKeySchema = z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);
export const timeSlotSchema = z.object({
  from: z.string().regex(/^\d{2}:\d{2}$/),
  to: z.string().regex(/^\d{2}:\d{2}$/),
});
export const availabilitySchema = z.record(dayKeySchema, z.array(timeSlotSchema)).default({});

export const diplomaSchema = z.object({
  title: z.string().min(1).max(200),
  institution: z.string().max(200).optional(),
  year: z.coerce.number().int().min(1950).max(2100).optional(),
});

export const benefitItemSchema = z.object({
  label: z.string().min(1).max(100),
  amount: z.coerce.number().min(0).max(1_000_000),
});

export const deductionItemSchema = z.object({
  label: z.string().min(1).max(100),
  amount: z.coerce.number().min(0).max(1_000_000),
  date: z.string().optional(),
});

export const personCreateSchema = z.object({
  type: personTypeSchema,
  /// Rôle paramétrable (uniquement pour TEACHER ou STAFF). UUID ou undefined.
  roleId: z.string().uuid().optional(),
  /// Service / département de rattachement (surtout STAFF). Voir STAFF_SERVICES.
  service: staffServiceSchema.optional(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  birthDate: z.coerce.date().optional(),
  gender: genderSchema.optional(),
  nationality: z.string().max(60).optional(),
  cin: z.string().max(40).optional(),
  /// État civil bilingue — colonnes dédiées, saisies côté FR et côté AR.
  firstNameAr: z.string().max(100).optional(),
  lastNameAr: z.string().max(100).optional(),
  birthPlace: z.string().max(120).optional(),
  birthPlaceAr: z.string().max(120).optional(),
  nationalityAr: z.string().max(60).optional(),
  addressAr: z.string().max(200).optional(),
  cityAr: z.string().max(120).optional(),
  fatherFirstNameAr: z.string().max(100).optional(),
  motherFirstNameAr: z.string().max(100).optional(),
  /// Régime de l'élève (STUDENT uniquement) : externe / demi-pensionnaire / interne.
  regime: regimeSchema.optional(),
  /// L'élève utilise-t-il le transport scolaire ? (STUDENT uniquement.)
  usesTransport: z.coerce.boolean().optional(),
  /// Code élève MASSAR — colonne dédiée `Person.massarId`, unique par
  /// établissement : c'est la clé de rapprochement de l'import MASSAR.
  massarId: z.string().max(40).optional(),
  /// Champs élève additionnels (stockés en metadata, pas en colonnes) :
  cne: z.string().max(40).optional(), // Code National d'Examen
  imageRights: z.coerce.boolean().optional(), // Droit à l'image
  exitRights: z.coerce.number().int().min(0).max(9).optional(), // Droit de sortie (0–9)
  dietInfo: z.string().max(2000).optional(), // Régime alimentaire / allergies (DP/interne)
  originSchool: z.string().max(200).optional(), // Établissement d'origine
  /// Établissement d'origine en arabe — exigé par MASAR, saisi dans l'onglet
  /// « Données en arabe » du formulaire d'inscription.
  originSchoolAr: z.string().max(200).optional(),
  repeating: z.coerce.boolean().optional(), // Redoublement
  contacts: z
    .object({
      email: z.string().email().optional(),
      phone: z.string().max(30).optional(),
      whatsapp: z.string().max(30).optional(),
    })
    .partial()
    .optional(),
  address: z
    .object({
      line1: z.string().optional(),
      city: z.string().optional(),
      postalCode: z.string().optional(),
      country: z.string().optional(),
    })
    .partial()
    .optional(),
  /// Pour un STUDENT : liens vers les parents existants à attacher.
  parents: z.array(z.object({ parentId: z.string().uuid(), type: relationTypeSchema })).optional(),
  /// Dates d'entrée / sortie de fonction (TEACHER ou STAFF uniquement).
  hireDate: z.coerce.date().optional(),
  contractEndDate: z.coerce.date().optional(),
  contractType: contractTypeSchema.optional(),
  /// Données RH employeur (TEACHER + STAFF, stockées en metadata) :
  cnssNumber: z.string().max(40).optional(), // N° CNSS
  amoNumber: z.string().max(40).optional(), // N° AMO
  employmentStatus: z.enum(['ACTIVE', 'SUSPENDED', 'RESIGNED', 'CONTRACT_END']).optional(), // Statut
  /// Volume horaire contractuel hebdomadaire (TEACHER uniquement) — sert
  /// au KPI de couverture horaire de l'établissement. Indépendant de
  /// availability et des heures réellement enseignées.
  contractualHoursPerWeek: z.coerce.number().int().min(0).max(60).optional(),
  /// Compétences pédagogiques (TEACHER uniquement)
  specialtySubjectIds: z.array(z.string().uuid()).optional(),
  cycleIds: z.array(z.string().uuid()).optional(),
  /// Classes prioritaires (TEACHER) : servi en priorité sur ces classes à la
  /// génération de l'EDT. Préférence d'allocation, pas affectation ferme.
  priorityClassIds: z.array(z.string().uuid()).optional(),
  /// Données RH (TEACHER + STAFF)
  experienceYears: z.coerce.number().int().min(0).max(80).optional(),
  diplomas: z.array(diplomaSchema).optional(),
  availability: availabilitySchema.optional(),
  /// Données financières (TEACHER + STAFF)
  rib: z.string().max(40).optional(),
  bankName: z.string().max(100).optional(),
  payrollMethod: payrollMethodSchema.optional(),
  grossSalary: z.coerce.number().min(0).max(1_000_000).optional(),
  netSalary: z.coerce.number().min(0).max(1_000_000).optional(),
  benefits: z.array(benefitItemSchema).optional(),
  deductions: z.array(deductionItemSchema).optional(),
});

export type PersonCreate = z.infer<typeof personCreateSchema>;

export const personUpdateSchema = personCreateSchema.partial();
export type PersonUpdate = z.infer<typeof personUpdateSchema>;
