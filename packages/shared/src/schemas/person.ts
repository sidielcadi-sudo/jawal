import { z } from 'zod';

export const personTypeSchema = z.enum(['STUDENT', 'PARENT', 'TEACHER', 'STAFF']);
export const genderSchema = z.enum(['M', 'F', 'X']);

export const relationTypeSchema = z.enum(['FATHER', 'MOTHER', 'LEGAL_GUARDIAN', 'GUARDIAN']);
export type RelationTypeValue = z.infer<typeof relationTypeSchema>;

export const contractTypeSchema = z.enum(['CDI', 'CDD', 'VACATAIRE', 'STAGIAIRE', 'AUTRE']);
export type ContractTypeValue = z.infer<typeof contractTypeSchema>;

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
});

export type PersonCreate = z.infer<typeof personCreateSchema>;

export const personUpdateSchema = personCreateSchema.partial();
export type PersonUpdate = z.infer<typeof personUpdateSchema>;
