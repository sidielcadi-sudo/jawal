import { z } from 'zod';

export const personTypeSchema = z.enum(['STUDENT', 'PARENT', 'TEACHER', 'STAFF']);
export const genderSchema = z.enum(['M', 'F', 'X']);

export const personCreateSchema = z.object({
  type: personTypeSchema,
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
});

export type PersonCreate = z.infer<typeof personCreateSchema>;

export const personUpdateSchema = personCreateSchema.partial();
export type PersonUpdate = z.infer<typeof personUpdateSchema>;
