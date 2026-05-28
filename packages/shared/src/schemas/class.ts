import { z } from 'zod';

export const classCreateSchema = z.object({
  name: z.string().min(1).max(60),
  academicYearId: z.string().uuid(),
  levelId: z.string().uuid(),
  capacity: z.coerce.number().int().min(1).max(200).default(30),
  mainTeacherId: z
    .preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), z.string().uuid().optional())
    .optional(),
});

export type ClassCreate = z.infer<typeof classCreateSchema>;

export const classUpdateSchema = classCreateSchema.partial().extend({
  // L'année et le niveau ne sont pas modifiables après création (changerait
  // la sémantique pédagogique de la classe — créer une nouvelle classe à la place).
  academicYearId: z.string().uuid().optional(),
  levelId: z.string().uuid().optional(),
});

export type ClassUpdate = z.infer<typeof classUpdateSchema>;

export const enrollStudentSchema = z.object({
  studentId: z.string().uuid(),
});

export type EnrollStudentInput = z.infer<typeof enrollStudentSchema>;
