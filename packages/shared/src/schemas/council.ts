import { z } from 'zod';

export const councilDecisionSchema = z.enum([
  'FELICITATIONS',
  'ENCOURAGEMENTS',
  'COMPLIMENTS',
  'AVERTISSEMENT_TRAVAIL',
  'AVERTISSEMENT_COMP',
  'PASSAGE',
  'REDOUBLEMENT',
  'ORIENTATION',
]);
export type CouncilDecisionInput = z.infer<typeof councilDecisionSchema>;

export const subjectAppreciationSchema = z.object({
  studentId: z.string().uuid(),
  subjectId: z.string().uuid(),
  periodId: z.string().uuid(),
  text: z.string().min(1).max(2000),
});
export type SubjectAppreciationInput = z.infer<typeof subjectAppreciationSchema>;

export const councilEntrySchema = z.object({
  classId: z.string().uuid(),
  studentId: z.string().uuid(),
  periodId: z.string().uuid(),
  generalAppreciation: z
    .preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z.string().min(1).max(2000).optional(),
    )
    .optional(),
  decision: z
    .preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      councilDecisionSchema.optional(),
    )
    .optional(),
  heldAt: z
    .preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z.coerce.date().optional(),
    )
    .optional(),
});
export type CouncilEntryInput = z.infer<typeof councilEntrySchema>;
