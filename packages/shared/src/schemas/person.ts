import { z } from 'zod';

export const personTypeSchema = z.enum(['STUDENT', 'PARENT', 'TEACHER', 'STAFF']);
export const genderSchema = z.enum(['M', 'F', 'X']);

export const relationTypeSchema = z.enum(['FATHER', 'MOTHER', 'LEGAL_GUARDIAN', 'GUARDIAN']);
export type RelationTypeValue = z.infer<typeof relationTypeSchema>;

export const contractTypeSchema = z.enum(['CDI', 'CDD', 'VACATAIRE', 'STAGIAIRE', 'AUTRE']);
export type ContractTypeValue = z.infer<typeof contractTypeSchema>;

export const payrollMethodSchema = z.enum(['BANK_TRANSFER', 'CHECK', 'CASH', 'OTHER']);
export type PayrollMethodValue = z.infer<typeof payrollMethodSchema>;

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
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  birthDate: z.coerce.date().optional(),
  gender: genderSchema.optional(),
  nationality: z.string().max(60).optional(),
  cin: z.string().max(40).optional(),
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
  parents: z
    .array(z.object({ parentId: z.string().uuid(), type: relationTypeSchema }))
    .optional(),
  /// Dates d'entrée / sortie de fonction (TEACHER ou STAFF uniquement).
  hireDate: z.coerce.date().optional(),
  contractEndDate: z.coerce.date().optional(),
  contractType: contractTypeSchema.optional(),
  /// Compétences pédagogiques (TEACHER uniquement)
  specialtySubjectIds: z.array(z.string().uuid()).optional(),
  cycleIds: z.array(z.string().uuid()).optional(),
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
