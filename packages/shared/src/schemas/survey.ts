import { z } from 'zod';

export const surveyAudienceSchema = z.enum(['ALL', 'PARENTS', 'TEACHERS', 'STAFF', 'STUDENTS']);
export type SurveyAudienceValue = z.infer<typeof surveyAudienceSchema>;

export const surveyStatusSchema = z.enum(['DRAFT', 'OPEN', 'CLOSED']);
export type SurveyStatusValue = z.infer<typeof surveyStatusSchema>;

export const surveyQuestionTypeSchema = z.enum(['RATING_5', 'TEXT']);
export type SurveyQuestionTypeValue = z.infer<typeof surveyQuestionTypeSchema>;

/** Échelle des questions notées : 1 (pas du tout satisfait) → 5 (très satisfait). */
export const RATING_MIN = 1;
export const RATING_MAX = 5;

export const surveyQuestionInputSchema = z.object({
  label: z.string().min(1).max(300),
  type: surveyQuestionTypeSchema,
  required: z.boolean().default(true),
});
export type SurveyQuestionInput = z.infer<typeof surveyQuestionInputSchema>;

export const surveyCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  audience: surveyAudienceSchema,
  /// Période académique de rattachement (filtre du KPI). Optionnel.
  periodId: z.string().uuid().optional(),
  anonymous: z.boolean().default(true),
  /// Au moins une question, dont au moins une notée pour alimenter le KPI.
  questions: z
    .array(surveyQuestionInputSchema)
    .min(1, 'Ajoutez au moins une question.')
    .max(30)
    .refine((qs) => qs.some((q) => q.type === 'RATING_5'), {
      message: 'Ajoutez au moins une question notée (1–5).',
    }),
});
export type SurveyCreate = z.infer<typeof surveyCreateSchema>;

export const surveyAnswerInputSchema = z.object({
  questionId: z.string().uuid(),
  rating: z.coerce.number().int().min(RATING_MIN).max(RATING_MAX).optional(),
  text: z.string().max(2000).optional(),
});
export type SurveyAnswerInput = z.infer<typeof surveyAnswerInputSchema>;

export const surveyResponseSubmitSchema = z.object({
  surveyId: z.string().uuid(),
  answers: z.array(surveyAnswerInputSchema).min(1),
});
export type SurveyResponseSubmit = z.infer<typeof surveyResponseSubmitSchema>;
