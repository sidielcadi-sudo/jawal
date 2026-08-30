import { z } from 'zod';

// ─── Subject ────────────────────────────────────────────

export const subjectCreateSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9-_]+$/, 'Minuscules, chiffres, - ou _ uniquement'),
  label: z.string().min(1).max(120),
  /** Libellé arabe — facultatif, alimente les bulletins et l'interface AR. */
  labelAr: z
    .string()
    .max(120)
    .optional()
    .transform((v) => (v ? v : null))
    .nullable(),
  scale: z.coerce.number().min(1).max(1000).default(20),
  coefficient: z.coerce.number().min(0.1).max(20).default(1),
  order: z.coerce.number().int().min(0).max(99).default(0),
});
export type SubjectCreate = z.infer<typeof subjectCreateSchema>;

export const subjectUpdateSchema = subjectCreateSchema.partial();
export type SubjectUpdate = z.infer<typeof subjectUpdateSchema>;

// ─── Evaluation ─────────────────────────────────────────

export const evaluationCreateSchema = z.object({
  classId: z.string().uuid(),
  subjectId: z.string().uuid(),
  periodId: z.string().uuid(),
  label: z.string().min(1).max(120),
  date: z.coerce.date(),
  weight: z.coerce.number().min(0.1).max(20).default(1),
  maxValue: z.coerce.number().min(1).max(1000).default(20),
});
export type EvaluationCreate = z.infer<typeof evaluationCreateSchema>;

// ─── Grade ──────────────────────────────────────────────

export const gradeRowSchema = z.object({
  studentId: z.string().uuid(),
  value: z
    .preprocess(
      (v) => {
        if (v === '' || v === null || v === undefined) return null;
        const n = Number(v);
        return Number.isNaN(n) ? undefined : n;
      },
      z.number().min(0).max(1000).nullable(),
    )
    .nullable(),
  comment: z
    .preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : (v ?? undefined)),
      z.string().max(500).optional(),
    )
    .optional(),
});
export type GradeRowInput = z.infer<typeof gradeRowSchema>;

export const gradesBulkSaveSchema = z.object({
  evaluationId: z.string().uuid(),
  grades: z.array(gradeRowSchema).min(1).max(500),
});
export type GradesBulkSave = z.infer<typeof gradesBulkSaveSchema>;
